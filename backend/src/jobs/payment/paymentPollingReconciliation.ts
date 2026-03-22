import prisma from "../../config/prisma.js"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.js";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.js";
import { logWithContext } from "../../infrastructure/observability/logger.js";
import { eventBus } from "../../events/eventBus.js";


export class PaymentPollingReconciliationJob {
    static cronSchedule = "*/2 * * * *";
 
    static async run() {
        logWithContext("info", "[PaymentPolling] Starting");
    
            const stuckPayments = await prisma.payment.findMany({
            where: {
                paymentFlow: "PROVIDER",
                status: { in: ["PENDING", "RETRYING"] },
                updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
            },
            take: 20,
        });
    
        if (stuckPayments.length === 0) {
            logWithContext("info", "[PaymentPolling] No stuck payments");
            return { reconciled: 0, failed: 0 };
        }
    
        logWithContext("info", "[PaymentPolling] Found stuck payments", {
            count: stuckPayments.length,
        });
    
        let reconciled = 0;
        let failed = 0;
    
        for (const payment of stuckPayments) {
            try {
                const providerState = await PaymentProviderAdapter.lookup(payment);
        
                if (providerState.status === "PAID" && payment.status !== "PAID") {
                    if (!PaymentStateMachine.canTransition(payment.status, "PAID")) continue;
            
                    await prisma.$transaction(async (tx) => {
                        await tx.payment.update({
                            where: { uuid: payment.uuid },
                            data: {
                                status: "PAID",
                                paidAt: new Date(),
                                providerRef: providerState.providerRef,
                                snapshot: providerState.snapshot,
                            },
                        });
            
                        await tx.order.update({
                            where: { uuid: payment.orderUuid },
                            data: { status: "PAID", paymentStatus: "COMPLETED" },
                        });
                    });
            
                    eventBus.emit("PAYMENT_RECONCILED", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        tenantUuid: payment.tenantUuid,
                        storeUuid: payment.storeUuid,
                        reconciledBy: "POLLING",
                    });
            
                    reconciled++;
                } else if (providerState.status === "FAILED" && payment.status !== "FAILED") {
                    if (!PaymentStateMachine.canTransition(payment.status, "FAILED")) continue;
            
                    await prisma.payment.update({
                        where: { uuid: payment.uuid },
                        data: {
                            status: "FAILED",
                            failedAt: new Date(),
                            failureCode: "PROVIDER_DECLINED",
                            failureReason: "Reconciliation: provider reports failed",
                        },
                    });
            
                    eventBus.emit("PAYMENT_FAILED", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        tenantUuid: payment.tenantUuid,
                        storeUuid: payment.storeUuid,
                        failureCode: "PROVIDER_DECLINED",
                    });
            
                    failed++;
                }
            } catch (error: any) {
                logWithContext("error", "[PaymentPolling] Failed for payment", {
                    paymentUuid: payment.uuid,
                    error: error.message,
                    });
            }
        }
    
        logWithContext("info", "[PaymentPolling] Completed", { reconciled, failed });
        return { reconciled, failed };
    }
}