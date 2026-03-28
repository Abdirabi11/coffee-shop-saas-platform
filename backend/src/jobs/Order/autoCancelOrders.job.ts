import prisma from "../../config/prisma.ts"
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { OrderCancellationService } from "../../services/order/orderCancellation.service.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

const AUTO_CANCEL_MINUTES = 15;

export class AutoCancelOrdersJob{
    static async run(){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000);

        logWithContext("info", "[AutoCancelOrders] Starting job", {
            cutoffTime: cutoff.toISOString(),
        });

        try {
            const orders = await prisma.order.findMany({
                where: {
                    status: { in: ["PENDING", "PAYMENT_PENDING"] },
                    paymentStatus: "PENDING",
                    createdAt: { lt: cutoff },
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                    orderNumber: true,
                    status: true,
                },
                take: 100, // Process in batches
            });
        
            logWithContext("info", "[AutoCancelOrders] Found orders to cancel", {
                count: orders.length,
            });

            let cancelled = 0;
            let failed = 0;

            for (const order of orders) {
                try {
                   // Use proper cancellation service
                    await OrderCancellationService.cancelBeforePayment({
                        tenantUuid: order.tenantUuid,
                        orderUuid: order.uuid,
                        reason: `Auto-cancelled: No payment received within ${AUTO_CANCEL_MINUTES} minutes`,
                        cancelledBy: "SYSTEM",
                    });

                    cancelled++;

                    logWithContext("info", "[AutoCancelOrders] Order cancelled", {
                        orderUuid: order.uuid,
                        orderNumber: order.orderNumber,
                    });
                } catch (err: any) {
                    failed++;

                    logWithContext("error", "[AutoCancelOrders] Failed to cancel order", {
                        orderUuid: order.uuid,
                        error: err.message,
                    });
            
                    await DeadLetterQueue.record(
                        order.tenantUuid,
                        "AUTO_CANCEL_ORDER",
                        {
                            orderUuid: order.uuid,
                            orderNumber: order.orderNumber,
                            storeUuid: order.storeUuid,
                            currentStatus: order.status,
                        },
                        err.message
                    );
                }
            };
            const duration = Date.now() - startTime;

            logWithContext("info", "[AutoCancelOrders] Job completed", {
                cancelled,
                failed,
                durationMs: duration,
            });
      
            MetricsService.increment("order.auto_cancelled", cancelled);
            MetricsService.timing("order.auto_cancel.duration", duration);
      
            return { cancelled, failed };
        } catch (error: any) {
            logWithContext("error", "[AutoCancelOrders] Job failed", {
                error: error.message,
            });
        
            MetricsService.increment("order.auto_cancel.error", 1);
            throw error; 
        }
    }
};