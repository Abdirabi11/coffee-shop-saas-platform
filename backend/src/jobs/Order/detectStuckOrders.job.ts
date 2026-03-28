import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";

const STUCK_MINUTES = 60;

export class DetectStuckOrdersJob{
    static async run(){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
    
        logWithContext("info", "[DetectStuckOrders] Starting job");

        try {
            const stuckOrders = await prisma.order.findMany({
                where: {
                    status: "PAID",
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

            for (const order of stuckOrders) {
                const minutesStuck = Math.floor(
                    (Date.now() - order.updatedAt.getTime()) / 60000
                );

                // Emit event for monitoring/alerting
                EventBus.emit("ORDER_STUCK", {
                    orderUuid: order.uuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderNumber: order.orderNumber,
                    minutesStuck,
                });
    
                await prisma.adminAlert.create({
                    data: {
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
                    },
                })

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