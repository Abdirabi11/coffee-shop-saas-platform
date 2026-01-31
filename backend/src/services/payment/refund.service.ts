import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { RefundStateMachine } from "../../domain/payments/refundStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.js";
import { MetricsService } from "../../infrastructure/observability/metrics.js";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/payment-provider.adapter.js";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";

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
        if (order.payment.status !== "PAID") throw new Error("PAYMENT_NOT_REFUNDABLE");

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

        RefundStateMachine.assertTransition("REQUESTED", "PROCESSING");

        await RiskPolicyEnforcer.apply()

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

        RefundStateMachine.assertTransition(
            refund.status,
            "PROCESSING"
        );
        
        await prisma.refund.update({
            where: { uuid: refund.uuid },
            data: { status: "PROCESSING" },
        });

        EventBus.emit("REFUND_PROCESSING", {
            refundUuid: refund.uuid,
            orderUuid: refund.orderUuid,
            storeUuid: refund.storeUuid,
        });

        MetricsService.increment(
            refund.amount < refund.payment.amount
              ? "refund.partial.count"
              : "refund.full.count",
            1,
            { provider: refund.provider }
        );
          
          logWithContext("info", "Refund completed", {
            traceUuid,
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            amount: refund.amount,
          });
          

        try {
            const providerRef = await PaymentProviderAdapter.refund({
                provider: refund.provider,
                amount: refund.amount,
                paymentRef: refund.payment.providerRef!,
            });

            await prisma.$transaction(async (tx) => {
                RefundStateMachine.assertTransition(
                    "PROCESSING",
                    "COMPLETED"
                );

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
                    await tx.payment.update({
                        where: { uuid: refund.paymentUuid },
                        data: { status: "REFUNDED" },
                    });

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
            RefundStateMachine.assertTransition(
                refund.status,
                "FAILED"
            );
          
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

    static async processProviderRefund(providerRefund: any, event: any){
        const paymentUuid= providerRefund.metadata?.paymentUuid;
        if (!paymentUuid) {
            throw new Error("MISSING_PAYMENT_UUID_IN_REFUND");
        };
        
        const payment= await prisma.payment.findUnique({
            where: {uuid: paymentUuid},
            include: { refunds: true },
        });

        if (!payment) {
            throw new Error("PAYMENT_NOT_FOUND");
        };

        const existing = await prisma.refund.findFirst({
            where: { providerRef: event.uuid },
        });
        if (existing) return;

        // PaymentStateMachine.assertTransition(
        //     payment.status,
        //     "REFUNDED"
        // );
        
        await prisma.$transaction([
            prisma.refund.create({
              data: {
                paymentUuid,
                orderUuid: payment.orderUuid,
                provider: payment.provider,
                providerRef: event.id,
                amount: event.amount,
                currency: event.currency,
                status: "COMPLETED",
                raw: event,
              },
            }),
            
            // prisma.payment.update({
            //     where: { uuid: paymentUuid },
            //     data: {
            //       status: "REFUNDED",
            //       refundedAt: new Date(),
            //     },
            // }),
        ]);

        const totals = await tx.refund.aggregate({
            where: {
              paymentUuid,
              status: "COMPLETED",
            },
            _sum: { amount: true },
        });

        if (totals._sum.amount === payment.amount) {
            PaymentStateMachine.assertTransition(
              payment.status,
              "REFUNDED"
            );
      
            await tx.payment.update({
              where: { uuid: paymentUuid },
              data: { status: "REFUNDED" },
            });
        }

        EventBus.emit("PAYMENT_REFUNDED", {paymentUuid} );
    }
};

