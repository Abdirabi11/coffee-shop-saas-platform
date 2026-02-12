import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payments/paymentStateMachine.ts";
import { PaymentEventBus } from "../../events/eventBus.ts";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";


//* Check stuck payments by polling provider
//* Runs every 5 minutes
export class PaymentPollingReconciliationJob {
    static async run() {
        console.log("[PaymentPollingReconciliation] Starting...");

        const stuckPayments = await prisma.payment.findMany({
            where: {
                paymentFlow: "PROVIDER", 
                status: { in: ["PENDING", "RETRYING"] },
                updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
            },
            take: 20,
        });
    
        if (stuckPayments.length === 0) {
            console.log("[PaymentPollingReconciliation] No stuck payments found");
            return;
        }
    
        console.log(`[PaymentPollingReconciliation] Found ${stuckPayments.length} stuck payments`);
    
        let reconciled = 0;
        let failed = 0;
  
        for (const payment of stuckPayments) {
            try {
                // Poll provider for actual status
                const providerState = await PaymentProviderAdapter.lookup(payment);

                // If provider says PAID but we have it as PENDING
                if (providerState.status === "PAID" && payment.status !== "PAID") {
                    PaymentStateMachine.assertTransition(payment.status, "PAID");

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
                            data: {
                                status: "PAID",
                                paymentStatus: "COMPLETED",
                            },
                        });
                    });

                    PaymentEventBus.emit("PAYMENT_RECONCILED", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        storeUuid: payment.storeUuid,
                        reconciledBy: "POLLING",
                    });

                    reconciled++;
                    
                }
                // If provider says FAILED but we have it as PENDING
                else if (providerState.status === "FAILED" && payment.status !== "FAILED") {
                    PaymentStateMachine.assertTransition(payment.status, "FAILED");

                    await prisma.payment.update({
                        where: { uuid: payment.uuid },
                        data: { 
                            status: "FAILED",
                            failedAt: new Date(),
                        },
                    });

                    PaymentEventBus.emit("PAYMENT_FAILED", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        storeUuid: payment.storeUuid,
                        reason: "RECONCILIATION_MISMATCH",
                        failureCode: "PROVIDER_DECLINED",
                    });

                    failed++;
                }
            } catch (error: any) {
                console.error(`[PaymentPollingReconciliation] Failed for payment ${payment.uuid}:`, error.message);
            }
        }
  
        console.log(`[PaymentPollingReconciliation] Completed: ${reconciled} reconciled, ${failed} failed`);
    }
};