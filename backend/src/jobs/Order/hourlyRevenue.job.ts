import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class HourlyRevenueJob {
  static async run(hour = new Date()) {
    const start = new Date(hour);
    start.setMinutes(0, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    logWithContext("info", "[HourlyRevenue] Starting job", {
      hour: start.toISOString(),
    });

    try {
      const stats = await prisma.order.groupBy({
        by: ["tenantUuid", "storeUuid"],
        where: {
          status: "COMPLETED",
          createdAt: { gte: start, lt: end },
        },
        _sum: { totalAmount: true },
        _count: { uuid: true },
      });

      logWithContext("info", "[HourlyRevenue] Processing stores", {
        count: stats.length,
        hour: start.toISOString(),
      });

      for (const stat of stats) {
        await prisma.hourlyRevenue.upsert({
          where: {
            tenantUuid_storeUuid_hour: {
              tenantUuid: stat.tenantUuid,
              storeUuid: stat.storeUuid,
              hour: start,
            },
          },
          update: {
            revenue: stat._sum.totalAmount ?? 0,
            ordersCount: stat._count.uuid,
            updatedAt: new Date(),
          },
          create: {
            tenantUuid: stat.tenantUuid,
            storeUuid: stat.storeUuid,
            hour: start,
            revenue: stat._sum.totalAmount ?? 0,
            ordersCount: stat._count.uuid,
          },
        });
      };

      logWithContext("info", "[HourlyRevenue] Job completed", {
        storesProcessed: stats.length,
      });

      MetricsService.increment("order.hourly_revenue.calculated", stats.length);
    } catch (error: any) {
      logWithContext("error", "[HourlyRevenue] Job failed", {
        error: error.message,
      });

      throw error;
    }
  }
};
  