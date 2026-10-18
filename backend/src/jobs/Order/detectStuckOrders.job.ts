import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { AlertDedupService } from "../../services/alerts/AlertDedup.service.ts";

const STUCK_MINUTES = 60;

export class DetectStuckOrdersJob{
    // storeUuids narrows the run to those stores
    static async run(opts: { storeUuids?: string[] } = {}){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
    
        logWithContext("info", "[DetectStuckOrders] Starting job", {});

        try {
            const stuckOrders = await prisma.order.findMany({
                where: {
                    status: "PAID",
                    ...(opts.storeUuids && { storeUuid: { in: opts.storeUuids } }),
                    updatedAt: { lt: cutoff },
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                    orderNumber: true,
                    createdAt: true,
                    updatedAt: true,
                },
                take: 50,
            });
        
            logWithContext("info", "[DetectStuckOrders] Found stuck orders", {
                count: stuckOrders.length,
            });

            let alertsCreated = 0;

            for (const order of stuckOrders) {
                const minutesStuck = Math.floor(
                    (Date.now() - order.updatedAt.getTime()) / 60000
                );

                // At most one alert per order per day; the job sees the same
                // order every 10 minutes until it moves on
                const alert = await AlertDedupService.createOnce({
                    groupKey: `ORDER_STUCK:${order.uuid}`,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    alertType: "ORDER_ISSUE",
                    category: "OPERATIONAL",
                    level: "WARNING",
                    priority: "HIGH",
                    title: "Order Stuck in Processing",
                    message: `Order ${order.orderNumber} has been stuck in PAID status for ${minutesStuck} minutes`,
                    affectedEntity: "order",
                    affectedEntityId: order.uuid,
                    context: {
                        orderUuid: order.uuid,
                        minutesStuck,
                        createdAt: order.createdAt,
                        updatedAt: order.updatedAt,
                    },
                });
                if (!alert) continue;
                alertsCreated++;

                // Emit event for monitoring/alerting
                EventBus.emit("ORDER_STUCK", {
                    orderUuid: order.uuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderNumber: order.orderNumber,
                    minutesStuck,
                });

                logWithContext("warn", "[DetectStuckOrders] Stuck order detected", {
                    orderUuid: order.uuid,
                    orderNumber: order.orderNumber,
                    minutesStuck,
                });
          
                MetricsService.increment("order.stuck.detected", 1, {
                    tenantUuid: order.tenantUuid,
                });
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[DetectStuckOrders] Job completed", {
                stuckOrdersFound: stuckOrders.length,
                alertsCreated,
                durationMs: duration,
            });

            MetricsService.timing("order.stuck.detection.duration", duration);

            return stuckOrders.length;
        } catch (error: any) {
            logWithContext("error", "[DetectStuckOrders] Job failed", {
                error: error.message,
            });
        
            throw error;
        }
    }
};