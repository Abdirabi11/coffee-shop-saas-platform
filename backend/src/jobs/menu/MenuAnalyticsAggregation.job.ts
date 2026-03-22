import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.js";


export class MenuAnalyticsAggregationJob {
  
    //Aggregate analytics data daily
    static async run() {
        logWithContext("info", "[MenuAnalytics] Starting daily aggregation");

        try {
            const yesterday = dayjs().subtract(1, "day");
            const dateFrom = yesterday.startOf("day").toDate();
            const dateTo = yesterday.endOf("day").toDate();

            // Get all events from yesterday
            const events = await prisma.menuAnalyticEvent.findMany({
                where: {
                    occurredAt: {
                        gte: dateFrom,
                        lte: dateTo,
                    },
                },
            });

            // Aggregate by store
            const storeStats = new Map<string, any>();

            for (const event of events) {
                if (!storeStats.has(event.storeUuid)) {
                    storeStats.set(event.storeUuid, {
                        storeUuid: event.storeUuid,
                        menuViews: 0,
                        productViews: 0,
                        addToCarts: 0,
                        searches: 0,
                        uniqueSessions: new Set(),
                        uniqueUsers: new Set(),
                    });
                }

                const stats = storeStats.get(event.storeUuid)!;

                if (event.eventType === "MENU_VIEW") stats.menuViews++;
                if (event.eventType === "PRODUCT_VIEW") stats.productViews++;
                if (event.eventType === "PRODUCT_ADD_TO_CART") stats.addToCarts++;
                if (event.eventType === "MENU_SEARCH") stats.searches++;

                if (event.sessionId) stats.uniqueSessions.add(event.sessionId);
                if (event.userUuid) stats.uniqueUsers.add(event.userUuid);
            }

            // Log aggregated stats
            for (const [storeUuid, stats] of storeStats) {
                logWithContext("info", "[MenuAnalytics] Daily stats", {
                    storeUuid,
                    date: yesterday.format("YYYY-MM-DD"),
                    menuViews: stats.menuViews,
                    productViews: stats.productViews,
                    addToCarts: stats.addToCarts,
                    searches: stats.searches,
                    uniqueSessions: stats.uniqueSessions.size,
                    uniqueUsers: stats.uniqueUsers.size,
                });

                // TODO: Store in aggregated table for faster querying
            }

            logWithContext("info", "[MenuAnalytics] Aggregation completed", {
                date: yesterday.format("YYYY-MM-DD"),
                stores: storeStats.size,
                totalEvents: events.length,
            });

            return {
                stores: storeStats.size,
                totalEvents: events.length,
            };

        } catch (error: any) {
            logWithContext("error", "[MenuAnalytics] Aggregation failed", {
                error: error.message,
            });

            throw error;
        }
    }
}