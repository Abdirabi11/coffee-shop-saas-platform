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
                refunds: true,
            },
        });

        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (!order.payment) throw new Error("NO_PAYMENT_FOUND");

        const totalPaid = order.payment.amount;
        const refundedSoFar = order.refunds
           .filter(r => r.status === "COMPLETED")
           .reduce((s, r) => s + r.amount, 0);

        const refundableAmount = totalPaid - refundedSoFar;
        if (refundableAmount <= 0) {
            throw new Error("NOTHING_TO_REFUND");
        };

        const amount= input.amount ?? refundableAmount;
        if (amount > refundableAmount) {
            throw new Error("REFUND_AMOUNT_EXCEEDS_LIMIT");
        };

        const refund= await prisma.refund.create({
            data: {
                orderUuid: order.uuid,
                paymentUuid: order.payment.uuid,
                storeUuid: order.storeUuid,
                amount,
                currency: order.payment.currency,
                reason: input.reason,
                status: "REQUESTED",
                provider: order.payment.provider,
                requestedBy: input.requestedBy,
                snapshot: {
                    originalPayment: order.payment.snapshot,
                    requestedAmount: amount,
                }, 
            }
        });

        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            orderUuid: order.uuid,
            storeUuid: order.storeUuid,
            amount,
            currency: order.payment.currency,
            reason: input.reason,
            requestedBy: input.requestedBy,
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

        EventBus.emit("REFUND_PROCESSING", {
            refundUuid: refund.uuid,
            orderUuid: refund.orderUuid,
            storeUuid: refund.storeUuid,
        });

        try {
            // 🔌 Provider adapter (Stripe / Wallet / Mobile Money)
            const providerRef = await PaymentProviderAdapter.refund({
                provider: refund.provider,
                amount: refund.amount,
                paymentRef: refund.payment.providerRef!,
            });

            await prisma.$transaction(async (tx) => {
                await tx.refund.update({
                    where: { uuid: refund.uuid },
                    data: {
                      status: "COMPLETED",
                      providerRef,
                      processedAt: new Date(),
                    },
                });

                const totals = await tx.refund.aggregate({
                    where: {
                      paymentUuid: refund.paymentUuid,
                      status: "COMPLETED",
                    },
                    _sum: { amount: true },
                });

                if (
                    totals._sum.amount === refund.payment.amount
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
                storeUuid: refund.storeUuid,
                amount: refund.amount,
            });
        } catch (err: any) {
            await prisma.refund.update({
                where: { uuid: refund.uuid },
                data: { 
                    status: "FAILED",
                    failureReason: err.message,
                },
            });

            EventBus.emit("REFUND_FAILED", {
                refundUuid: refund.uuid,
                orderUuid: refund.orderUuid,
                storeUuid: refund.storeUuid,
                reason: err.message,
            });

            throw err;
        }
    }  
};

const ALLOWED_TRANSITIONS = {
    CREATED: ["LOCKED"],
    LOCKED: ["PAID", "FAILED"],
    PAID: ["REFUNDED"],
};
  
export function assertTransition(from: string, to: string) {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`INVALID_PAYMENT_TRANSITION ${from} → ${to}`);
    }
};