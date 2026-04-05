import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class ProductPopularityJob{
  static async runDaily(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    logWithContext("info", "[ProductPopularity] Starting job", {
      date: start.toISOString(),
    });

    try {
      // Group by tenant, store, and product
      const stats = await prisma.orderItem.groupBy({
        by: ["tenantUuid", "productUuid"],
        where: {
          order: {
            status: "COMPLETED",
            createdAt: { gte: start, lt: end },
          },
        },
        _sum: {
          quantity: true,
          finalPrice: true, // ✅ FIXED: Use finalPrice instead of price
        },
        _count: {
          uuid: true,
        },
      });

      logWithContext("info", "[ProductPopularity] Processing products", {
        count: stats.length,
      });

      for (const stat of stats) {
        // Get store for this product
        const orderItem = await prisma.orderItem.findFirst({
          where: {
            tenantUuid: stat.tenantUuid,
            productUuid: stat.productUuid,
            order: {
              status: "COMPLETED",
              createdAt: { gte: start, lt: end },
            },
          },
          include: {
            order: {
              select: { storeUuid: true },
            },
          },
        });

        if (!orderItem) continue;

        await prisma.productDailyMetrics.upsert({
          where: {
            tenantUuid_productUuid_storeUuid_date: {
              tenantUuid: stat.tenantUuid,
              productUuid: stat.productUuid,
              storeUuid: orderItem.order.storeUuid,
              date: start,
            },
          },
          update: {
            quantitySold: stat._sum.quantity ?? 0,
            ordersCount: stat._count.uuid,
            revenueGross: stat._sum.finalPrice ?? 0,
            revenueNet: stat._sum.finalPrice ?? 0,
            calculatedAt: new Date(),
          },
          create: {
            tenantUuid: stat.tenantUuid,
            storeUuid: orderItem.order.storeUuid,
            productUuid: stat.productUuid,
            date: start,
            quantitySold: stat._sum.quantity ?? 0,
            ordersCount: stat._count.uuid,
            revenueGross: stat._sum.finalPrice ?? 0,
            revenueNet: stat._sum.finalPrice ?? 0,
          },
        });
      };

      logWithContext("info", "[ProductPopularity] Job completed", {
        productsProcessed: stats.length,
      });

      MetricsService.increment("product.popularity.calculated", stats.length);
    } catch (error: any) {
      logWithContext("error", "[ProductPopularity] Job failed", {
        error: error.message,
      });

      throw error;
    }
  }
};