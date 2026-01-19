import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.js";

export class RefundService{
    static async requestRefund(input: {
        orderUuid: string,
        amount?: number; 
        reason: string;
        requestedBy: string;
    }){
        const order= await prisma.order.findUnique({
            where: {uuid: input.orderUuid},
            include: {
                payment: true,
                paymentSnapshot: true,
                refunds: true,
            },
        });

        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (!order.payment) throw new Error("NO_PAYMENT_FOUND");

        const totalPaid = order.payment.amount;
        const refundedSoFar = order.refunds.reduce(
            (sum, r) => sum + r.amount,
            0
        );

        const refundableAmount = totalPaid - refundedSoFar;
        if (refundableAmount <= 0) {
            throw new Error("NOTHING_TO_REFUND");
        };

        const refundAmount= input.amount ?? refundableAmount;
        if (refundAmount > refundableAmount) {
            throw new Error("REFUND_AMOUNT_EXCEEDS_LIMIT");
        };

        const refund= await prisma.refund.create({
            data: {
                orderUuid: order.uuid,
                paymentUuid: order.payment.uuid,
                storeUuid: order.storeUuid,
                amount: refundAmount,
                currency: order.payment.currency,
                reason: input.reason,
                status: "REQUESTED",
                provider: order.payment.provider,
                snapshot: {
                    requestedAmount: refundAmount,
                    originalPayment: order.payment.snapshot,
                },
                requestedBy: input.requestedBy,
            }
        })

        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            orderUuid: order.uuid,
            // storeUuid,
            // amount,
            // currency,
            // reason,
            // requestedBy,
        });
      
        return refund;
    };

    static async processRefund(refundUuid: string){
        const refund= await prisma.refund.findUnique({
            where: { uuid: refundUuid },
            include: { payment: true },
        });

        if (!refund) throw new Error("REFUND_NOT_FOUND");
        if (refund.status !== "REQUESTED") return;

        await prisma.refund.update({
            where: { uuid: refund.uuid },
            data: { status: "PROCESSING" },
        });

        try {
            // 🔌 Provider adapter (Stripe / Wallet / Mobile Money)
            const providerRef = await PaymentProviderAdapter.refund({
                provider: refund.provider,
                amount: refund.amount,
                paymentRef: refund.payment.providerRef!,
            });

            await prisma.$transaction.(async (tx)=> {
                await tx.refund.update({
                    where: { uuid: refund.uuid },
                    data: {
                      status: "REFUNDED",
                      providerRef,
                      processedAt: new Date(),
                    },
                });

                const totalRefunded = await tx.refund.aggregate({
                    where: {
                      paymentUuid: refund.paymentUuid,
                      status: "REFUNDED",
                    },
                    _sum: { amount: true },
                });

                if (
                    totalRefunded._sum.amount === refund.payment.amount
                  ) {
                    await tx.paymentSnapshot.update({
                      where: { orderUuid: refund.orderUuid },
                      data: { status: "REFUNDED" },
                    });
                };
            });

            EventBus.emit("REFUND_COMPLETED", {
                refundUuid: refund.uuid,
                orderUuid: refund.orderUuid,
            });
        } catch (error) {
            await prisma.refund.update({
                where: { uuid: refund.uuid },
                data: { status: "FAILED" },
            });

            EventBus.emit("REFUND_FAILED", {
                refundUuid: refund.uuid,
                error,
            });

            throw error;
        }
    }
};