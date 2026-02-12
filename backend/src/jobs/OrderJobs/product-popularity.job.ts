import prisma from "../../config/prisma.ts"

export class ProductPopularityJob{
  static async runDaily(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const stats = await prisma.orderItem.groupBy({
      by: ["tenantUuid","productUuid"],
      where: {
        order: {
          status: "COMPLETED",
          createdAt: { gte: start, lt: end },
        },
      },
      _sum: {
        quantity: true,
        price: true,
      },
    });

    for (const stat of stats) {
      const item= await prisma.orderItem.findFirst({
        where: {
          tenantUuid: stat.tenantUuid,
          productUuid: stat.productUuid,
        },
        include: {
          order: {
            select: { storeUuid: true },
          },
        },
      });
      if (!item) continue;

      await prisma.productDailyMetrics.upsert({
        where: {
          tenantUuid_productUuid_storeUuid_date: {
            tenantUuid: stat.tenantUuid,
            productUuid: stat.productUuid,
            storeUuid: item.order.storeUuid,
            date: start,
          },
        },
        update: {
          quantitySold: stat._sum.quantity ?? 0,
          revenueGross: stat._sum.finalPrice ?? 0,
          revenueNet: stat._sum.finalPrice ?? 0,
        },
        create: {
          tenantUuid: stat.tenantUuid,
          storeUuid: item.order.storeUuid,
          productUuid: stat.productUuid,
          date: start,
          quantitySold: stat._sum.quantity ?? 0,
          revenueGross: stat._sum.finalPrice ?? 0,
          revenueNet: stat._sum.finalPrice ?? 0,
        },
      });
    }
    console.log(`[ProductPopularityJob] Calculated popularity for ${stats.length} products`);
  }
};