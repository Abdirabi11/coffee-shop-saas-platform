import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { InventoryReleaseService } from "../../services/order/inventoryRelease.service.ts";
import { PaymentCancellationService } from "../../services/payment/paymentCancellation.service.ts";

export class PaymentExpiryCleanupJob{
    static async run(){
        const startTime = Date.now();
        logWithContext("info", "[PaymentExpiryCleanup] Starting cleanup job");
    
        console.log("[PaymentExpiryCleanup] Starting...");

        try {
            // Find expired payments still in PENDING
            const expiredPayments = await prisma.payment.findMany({
                where: {
                    paymentFlow: "PROVIDER",
                    status: "PENDING",
                    expiresAt: { lt: new Date() },
                },
                include: {
                    order: true,
                },
                take: 50,
            });

            if (expiredPayments.length === 0) {
                logWithContext("info", "[PaymentExpiryCleanup] No expired payments found");
                return;
            };
        
            let cancelled = 0;
            let failed = 0;

            for (const payment of expiredPayments) {
                try {
                    logWithContext("info", "[PaymentExpiryCleanup] Cancelling expired payment", {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        expiresAt: payment.expiresAt,
                    });

                    await PaymentCancellationService.cancel({
                        paymentUuid: payment.uuid,
                        reason: "Payment intent expired - no payment received within 15 minutes",
                        cancelledBy: "SYSTEM",
                    });
    
                    // Release inventory
                    await prisma.$transaction(async (tx) => {
                        await prisma.order.update({
                            where: { uuid: payment.orderUuid },
                            data: { 
                                status: "CANCELLED",
                                paymentStatus: "CANCELLED",
                                inventoryReleased: true,
                            },
                        });

                        await InventoryReleaseService.release(tx, payment.orderUuid);
                    });

                    cancelled++;

                    //double
                    MetricsService.increment("payment.expired.cancelled", 1, {
                        provider: payment.provider,
                    });
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[PaymentExpiryCleanup] Failed to cancel payment", {
                        paymentUuid: payment.uuid,
                        error: error.message,
                    });

                    MetricsService.increment("payment.expired.cancel_failed", 1);
                }
            }

            const duration = Date.now() - startTime;

            logWithContext("info", "[PaymentExpiryCleanup] Job completed", {
                total: expiredPayments.length,
                cancelled,
                failed,
                durationMs: duration,
            });

            MetricsService.timing("payment.expiry.cleanup.duration", duration);
            MetricsService.gauge("payment.expired.count", expiredPayments.length);
        } catch (error: any) {
            logWithContext("error", "[PaymentExpiryCleanup] Job failed", {
                error: error.message,
                stack: error.stack,
            });
        
            MetricsService.increment("payment.expiry.cleanup.error", 1);
            throw error; 
        }
    }
}