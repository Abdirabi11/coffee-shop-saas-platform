import prisma from "../../config/prisma.ts"
import { PaymentService } from "../../services/payment/payment.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { eventBus } from "../../events/eventBus.ts";


export class PaymentRetryJob {
    static cronSchedule = "*/30 * * * *";
    
    static async run() {
        logWithContext("info", "[PaymentRetry] Starting");
    
        const failedPayments = await prisma.payment.findMany({
            where: {
                paymentFlow: "PROVIDER",
                status: "FAILED",
                retries: { lt: 3 }, // Default max retries
                // Only retry recent failures (last 24h)
                failedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            take: 20,
        });
    
        if (failedPayments.length === 0) {
            logWithContext("info", "[PaymentRetry] No retryable payments");
            return { retried: 0, failed: 0 };
        }
    
        let retried = 0;
        let failed = 0;
    
        for (const payment of failedPayments) {
            try {
                await PaymentService.retryFailedPayment(payment.uuid);
                retried++;
            } catch (error: any) {
                failed++;
                logWithContext("warn", "[PaymentRetry] Retry failed", {
                    paymentUuid: payment.uuid,
                    retries: payment.retries,
                    error: error.message,
                });
        
                if (payment.retries + 1 >= payment.maxRetries) {
                // FIX #2: eventBus instead of OrderEventBus
                    eventBus.emit("PAYMENT_FAILED", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        tenantUuid: payment.tenantUuid,
                        storeUuid: payment.storeUuid,
                        failureCode: "MAX_RETRIES_EXCEEDED",
                        failureReason: "Payment failed after all retry attempts",
                    });
                }
            }
        }
    
        logWithContext("info", "[PaymentRetry] Completed", { retried, failed });
        return { retried, failed };
    }
}