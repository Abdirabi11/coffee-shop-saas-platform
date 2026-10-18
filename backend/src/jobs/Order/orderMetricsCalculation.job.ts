import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { avgPrepMinutes, storeDaysDue, type StoreDay } from "../Analytics/storeDays.ts";

// Runs hourly. Writes OrderDailyMetrics for each store's previous local
// calendar day (see storeDaysDue), over the orders created that day.
export class OrderMetricsCalculationJob {
    static async run(now: Date = new Date(), opts: { storeUuids?: string[]; localDate?: string } = {}) {
        const days = await storeDaysDue(now, opts);

        let processed = 0;
        let failed = 0;
        for (const day of days) {
            try {
                await this.calculateStoreMetrics(day);
                processed++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[OrderMetrics] Failed to calculate metrics", {
                    storeUuid: day.storeUuid,
                    date: day.localDate,
                    error: error.message,
                });
            }
        }

        if (days.length > 0) {
            logWithContext("info", "[OrderMetrics] Calculation completed", { storeDays: days.length, processed, failed });
        }
        return { processed, failed };
    }

    static async calculateStoreMetrics(day: StoreDay) {
        const { storeUuid, tenantUuid, dateKey } = day;

        const [byStatus, prepMinutes] = await Promise.all([
            prisma.order.groupBy({
                by: ["status"],
                where: { storeUuid, createdAt: { gte: day.start, lt: day.end } },
                _count: { _all: true },
                _sum: { totalAmount: true },
            }),
            avgPrepMinutes(storeUuid, day.start, day.end),
        ]);

        const completed = byStatus.find((s) => s.status === "COMPLETED");
        const completedOrders = completed?._count._all ?? 0;
        const totalRevenue = completed?._sum.totalAmount ?? 0;
        const figures = {
            totalOrders: byStatus.reduce((sum, s) => sum + s._count._all, 0),
            completedOrders,
            cancelledOrders: byStatus.find((s) => s.status === "CANCELLED")?._count._all ?? 0,
            totalRevenue,
            avgOrderValue: completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0,
            avgPreparationTime: Math.round(prepMinutes),
        };

        return prisma.orderDailyMetrics.upsert({
            where: { tenantUuid_storeUuid_date: { tenantUuid, storeUuid, date: dateKey } },
            update: { ...figures, calculatedAt: new Date() },
            create: { tenantUuid, storeUuid, date: dateKey, ...figures },
        });
    }
}
