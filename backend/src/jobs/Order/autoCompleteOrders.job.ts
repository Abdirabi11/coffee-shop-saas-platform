import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import prisma from "../config/prisma.ts"
import { OrderStatusService } from "../services/order/order-status.service.ts";

const AUTO_COMPLETE_MINUTES = 20;

export class AutoCompleteOrdersJob{
    static async run(){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - AUTO_COMPLETE_MINUTES * 60 * 1000);

        logWithContext("info", "[AutoCompleteOrders] Starting job", {
            cutoffTime: cutoff.toISOString(),
        });

        try {
            const orders = await prisma.order.findMany({
                where: {
                    status: "READY",
                    actualReadyAt: { lt: cutoff },
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                    orderNumber: true,
                    actualReadyAt: true,
                },
                take: 100,
            });

            logWithContext("info", "[AutoCompleteOrders] Found orders to complete", {
                count: orders.length,
            });
        
            let completed = 0;
            let failed = 0;

            for (const order of orders) {
                try {
                    const minutesInReady = Math.floor(
                        (Date.now() - order.actualReadyAt!.getTime()) / 60000
                    );

                    await OrderStatusService.transition(order.uuid, "COMPLETED", {
                        changedBy: "system",
                        reason: "Auto-completed after 30 minutes in READY status",
                    });
                    completed++;

                    logWithContext("info", "[AutoCompleteOrders] Order completed", {
                        orderUuid: order.uuid,
                        orderNumber: order.orderNumber,
                        minutesInReady,
                    });
                } catch (err: any) {
                    failed++;

                    logWithContext("error", "[AutoCompleteOrders] Failed to complete order", {
                        orderUuid: order.uuid,
                        error: err.message,
                    });
            
                    await DeadLetterQueue.record(
                        order.tenantUuid,
                        "AUTO_COMPLETE_ORDER",
                        {
                            orderUuid: order.uuid,
                            orderNumber: order.orderNumber,
                            storeUuid: order.storeUuid,
                        },
                        err.message
                    );
                };   
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[AutoCompleteOrders] Job completed", {
                completed,
                failed,
                durationMs: duration,
            });
      
            MetricsService.increment("order.auto_completed", completed);
            MetricsService.timing("order.auto_complete.duration", duration);
      
            return { completed, failed };
        } catch (error: any) {
            logWithContext("error", "[AutoCompleteOrders] Job failed", {
                error: error.message,
            });
        
            MetricsService.increment("order.auto_complete.error", 1);
            throw error;
        }
    }
};