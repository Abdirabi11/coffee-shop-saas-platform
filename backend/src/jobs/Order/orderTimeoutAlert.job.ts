import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { AlertDedupService } from "../../services/alerts/AlertDedup.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

const PREPARING_TIMEOUT_MINUTES = 30;

// Per run: candidates read a page at a time (oldest first), at most
// MAX_SCANNED of them, and at most MAX_NEW_ALERTS new alerts raised
const PAGE_SIZE = 50;
const MAX_SCANNED = 2000;
const MAX_NEW_ALERTS = 50;

export class OrderTimeoutAlertJob{
    // storeUuids narrows the run to those stores
    static async run(opts: { storeUuids?: string[] } = {}){
        const startTime = Date.now();
        const cutoff = new Date(Date.now() - PREPARING_TIMEOUT_MINUTES * 60 * 1000);

        logWithContext("info", "[OrderTimeoutAlert] Starting job", {});

        try {
            // Oldest first, a page at a time. Already-alerted orders are
            // skipped by the dedup, so walking past them (instead of taking one
            // fixed batch of 50) lets newer stuck orders be reached too; new
            // alerts per run are capped so a backlog can't flood the inbox.
            const delayedOrders = [];
            let cursor: string | undefined;
            while (delayedOrders.length < MAX_SCANNED) {
                const page = await prisma.order.findMany({
                    where: {
                        status: "PREPARING",
                        ...(opts.storeUuids && { storeUuid: { in: opts.storeUuids } }),
                        updatedAt: { lt: cutoff },
                    },
                    select: {
                        uuid: true,
                        tenantUuid: true,
                        storeUuid: true,
                        orderNumber: true,
                        updatedAt: true,
                    },
                    orderBy: [{ updatedAt: "asc" }, { uuid: "asc" }],
                    take: PAGE_SIZE,
                    ...(cursor && { cursor: { uuid: cursor }, skip: 1 }),
                });
                delayedOrders.push(...page);
                if (page.length < PAGE_SIZE) break;
                cursor = page[page.length - 1].uuid;
            }
        
            logWithContext("info", "[OrderTimeoutAlert] Found delayed orders", {
                count: delayedOrders.length,
            });

            let alertsCreated = 0;

            for (const order of delayedOrders) {
                if (alertsCreated >= MAX_NEW_ALERTS) break;

                const minutesDelayed = Math.floor(
                    (Date.now() - order.updatedAt.getTime()) / 60000
                );

                // At most one alert per order per day; the job sees the same
                // order every 15 minutes until it is ready
                const alert = await AlertDedupService.createOnce({
                    groupKey: `ORDER_PREPARATION_DELAYED:${order.uuid}`,
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
                });
                if (!alert) continue;
                alertsCreated++;

                // Emit event for notifications
                EventBus.emit("ORDER_PREPARATION_DELAYED", {
                    orderUuid: order.uuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderNumber: order.orderNumber,
                    minutesDelayed,
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
                alertsCreated,
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