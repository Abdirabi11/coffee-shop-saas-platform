import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

const PREPARING_TIMEOUT_MINUTES = 30;

export class OrderTimeoutAlertJob{
    static async run (){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - PREPARING_TIMEOUT_MINUTES * 60 * 1000);

        logWithContext("info", "[OrderTimeoutAlert] Starting job");

        try {
            const delayedOrders = await prisma.order.findMany({
                where: {
                    status: "PREPARING",
                    updatedAt: { lt: cutoff },
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                    orderNumber: true,
                    updatedAt: true,
                },
                take: 50,
            });
        
            logWithContext("info", "[OrderTimeoutAlert] Found delayed orders", {
                count: delayedOrders.length,
            });

            for (const order of delayedOrders) {
                const minutesDelayed = Math.floor(
                    (Date.now() - order.updatedAt.getTime()) / 60000
                );

                // Emit event for notifications
                EventBus.emit("ORDER_PREPARATION_DELAYED", {
                    orderUuid: order.uuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderNumber: order.orderNumber,
                    minutesDelayed,
                });

                // Create admin alert
                await prisma.adminAlert.create({
                    data: {
                        tenantUuid: order.tenantUuid,
                        storeUuid: order.storeUuid,
                        alertType: "ORDER_ISSUE",
                        category: "OPERATIONAL",
                        level: "WARNING",
                        priority: "MEDIUM",
                        title: "Order Preparation Delayed",
                        message: `Order ${order.orderNumber} has been preparing for ${minutesDelayed} minutes`,
                        affectedEntity: "order",
                        affectedEntityId: order.uuid,
                        context: {
                            minutesDelayed,
                        },
                    },
                });

                logWithContext("warn", "[OrderTimeoutAlert] Delayed order detected", {
                    orderUuid: order.uuid,
                    minutesDelayed,
                });
          
                MetricsService.increment("order.preparation.delayed", 1, {
                    tenantUuid: order.tenantUuid,
                });
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[OrderTimeoutAlert] Job completed", {
                delayedOrders: delayedOrders.length,
                durationMs: duration,
            });
      
            return delayedOrders.length;
        } catch (error: any) {
            logWithContext("error", "[OrderTimeoutAlert] Job failed", {
                error: error.message,
            });
        
            throw error;
        }
    }
};