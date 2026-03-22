import prisma from "../../config/prisma.js"
import { logWithContext } from "../../infrastructure/observability/logger.js";
import { MetricsService } from "../../infrastructure/observability/metricsService.js";
import { PaymentCancellationService } from "../../services/payment/paymentCancellation.service.js";

export class PaymentExpiryCleanupJob {
    static cronSchedule = "*/5 * * * *";
 
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[PaymentExpiryCleanup] Starting");
    
        try {
            const expiredPayments = await prisma.payment.findMany({
                where: {
                    paymentFlow: "PROVIDER",
                    status: "PENDING",
                    expiresAt: { lt: new Date() },
                },
                take: 50,
            });
        
            if (expiredPayments.length === 0) {
                logWithContext("info", "[PaymentExpiryCleanup] No expired payments");
                return { cancelled: 0, failed: 0 };
            }
        
            let cancelled = 0;
            let failed = 0;
    
            for (const payment of expiredPayments) {
                try {
                    await PaymentCancellationService.cancel({
                        paymentUuid: payment.uuid,
                        reason: "Payment expired — no confirmation received within timeout window",
                        cancelledBy: "SYSTEM",
                    });
        
                    cancelled++;
            
                    MetricsService.increment("payment.expired.cancelled", 1, {
                        provider: payment.provider ?? "unknown",
                    });
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[PaymentExpiryCleanup] Cancel failed", {
                        paymentUuid: payment.uuid,
                        error: error.message,
                    });
                }
            };
    
            const duration = Date.now() - startTime;
            logWithContext("info", "[PaymentExpiryCleanup] Completed", {
                total: expiredPayments.length,
                cancelled,
                failed,
                durationMs: duration,
            });
        
            return { cancelled, failed };
        } catch (error: any) {
            logWithContext("error", "[PaymentExpiryCleanup] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}