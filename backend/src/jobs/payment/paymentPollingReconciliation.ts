import prisma from "../../config/prisma.ts"
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { eventBus } from "../../events/eventBus.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";


export class PaymentPollingReconciliationJob {
    static cronSchedule = "*/2 * * * *";
 
    static async run() {
        logWithContext("info", "[PaymentPolling] Starting", {});
    
            const stuckPayments = await prisma.payment.findMany({
            where: {
                paymentFlow: "PROVIDER",
                status: { in: ["PENDING", "RETRYING"] },
                // Placeholders whose provider call never finished have no ref
                providerRef: { not: null },
                provider: { not: null },
                updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
            },
            take: 20,
        });
    
        if (stuckPayments.length === 0) {
            logWithContext("info", "[PaymentPolling] No stuck payments", {});
            return { reconciled: 0, failed: 0 };
        }
    
        logWithContext("info", "[PaymentPolling] Found stuck payments", {
            count: stuckPayments.length,
        });
    
        let reconciled = 0;
        let failed = 0;
    
        for (const payment of stuckPayments) {
            try {
                const providerState = await PaymentProviderAdapter.lookup({
                    provider: payment.provider!,
                    providerRef: payment.providerRef!,
                });

                // Same guarded paths as webhooks: row locks, amount/currency
                // check, order state machine, auto-refund if unpayable
                if (providerState.status === "PAID") {
                    const { outcome } = await PaymentService.confirmFromProviderEvent({
                        paymentUuid: payment.uuid,
                        providerRef: payment.providerRef!,
                        amountReceived: providerState.amountReceived,
                        currency: providerState.currency,
                        snapshot: providerState.snapshot,
                        source: "POLLING",
                    });

                    if (outcome === "CONFIRMED") {
                        eventBus.emit("PAYMENT_RECONCILED", {
                            paymentUuid: payment.uuid,
                            orderUuid: payment.orderUuid,
                            tenantUuid: payment.tenantUuid,
                            storeUuid: payment.storeUuid,
                            reconciledBy: "POLLING",
                        });
                        reconciled++;
                    }
                } else if (providerState.status === "FAILED") {
                    await PaymentService.markFailedFromProvider({
                        paymentUuid: payment.uuid,
                        failureCode: "PROVIDER_DECLINED",
                        failureReason: "Reconciliation: provider reports failed",
                        snapshot: providerState.snapshot,
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