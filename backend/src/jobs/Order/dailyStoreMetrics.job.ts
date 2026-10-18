import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { avgPrepMinutes, storeDaysDue, type StoreDay } from "../Analytics/storeDays.ts";

// Orders not yet finished (or abandoned)
const OPEN_STATUSES = new Set(["PENDING", "PAID", "PREPARING", "READY"]);

// Runs hourly. Writes the order and customer columns of StoreDailyMetrics
// for each store's previous local calendar day (see storeDaysDue), over the
// orders created that day. The money columns are AnalyticsAggregationJob's.
export class DailyStoreMetricsJob {
    static async run(now: Date = new Date(), opts: { storeUuids?: string[]; localDate?: string } = {}) {
        const days = await storeDaysDue(now, opts);

        let computed = 0;
        let failed = 0;
        for (const day of days) {
            try {
                await this.calculateStoreDay(day);
                computed++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[DailyStoreMetrics] Store day failed", {
                    storeUuid: day.storeUuid,
                    date: day.localDate,
                    error: error.message,
                });
            }
        }

        if (days.length > 0) {
            logWithContext("info", "[DailyStoreMetrics] Completed", { storeDays: days.length, computed, failed });
        }
        return { computed, failed };
    }

    static async calculateStoreDay(day: StoreDay) {
        const { storeUuid, tenantUuid, dateKey } = day;
        const window = { gte: day.start, lt: day.end };
        const completed = { storeUuid, status: "COMPLETED" as const, createdAt: window };

        const [byStatus, customers, newCustomers, items, prepMinutes] = await Promise.all([
            prisma.order.groupBy({
                by: ["status"],
                where: { storeUuid, createdAt: window },
                _count: { _all: true },
            }),
            // One row per customer, not per order
            prisma.order.groupBy({ by: ["tenantUserUuid"], where: completed }),
            prisma.order.groupBy({
                by: ["tenantUserUuid"],
                where: { ...completed, tenantUser: { createdAt: window } },
            }),
            prisma.orderItem.aggregate({ where: { order: completed }, _sum: { quantity: true } }),
            avgPrepMinutes(storeUuid, day.start, day.end),
        ]);

        const count = (match: (status: string) => boolean) =>
            byStatus.filter((s) => match(s.status)).reduce((sum, s) => sum + s._count._all, 0);
        const ordersCompleted = count((s) => s === "COMPLETED");
        const itemsSold = items._sum.quantity ?? 0;
        const figures = {
            ordersTotal: count(() => true),
            ordersCompleted,
            ordersCancelled: count((s) => s === "CANCELLED"),
            ordersPending: count((s) => OPEN_STATUSES.has(s)),
            uniqueCustomers: customers.length,
            newCustomers: newCustomers.length,
            returningCustomers: customers.length - newCustomers.length,
            itemsSold,
            avgItemsPerOrder: ordersCompleted > 0 ? itemsSold / ordersCompleted : 0,
            avgPrepTimeMin: prepMinutes,
        };

        return prisma.storeDailyMetrics.upsert({
            where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: dateKey } },
            update: { ...figures, calculatedAt: new Date() },
            create: { tenantUuid, storeUuid, date: dateKey, ...figures },
        });
    }
}
