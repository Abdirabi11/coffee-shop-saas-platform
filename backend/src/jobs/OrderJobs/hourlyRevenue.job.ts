import prisma from "../../config/prisma.ts"

export class HourlyRevenueJob {
  static async run(hour = new Date()) {
    const start = new Date(hour);
    start.setMinutes(0, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const stats = await prisma.order.groupBy({
      by: ["tenantUuid", "storeUuid"],
      where: {
        status: "COMPLETED",
        createdAt: { gte: start, lt: end },
      },
      _sum: { totalAmount: true },
      _count: { uuid: true },
    });

    console.log(`[HourlyRevenueJob] Processing ${stats.length} stores for hour ${start.toISOString()}`);

    for (const stat of stats) {
      await prisma.hourlyRevenue.upsert({
        where: {
          storeUuid_hour: {
            storeUuid: stat.storeUuid,
            hour: start,
          },
        },
        update: {
          revenue: stat._sum.totalAmount ?? 0,
          ordersCount: stat._count.uuid,
        },
        create: {
          storeUuid: stat.storeUuid,
          hour: start,
          revenue: stat._sum.totalAmount ?? 0,
          ordersCount: stat._count.uuid,
        },
      });
    };
    console.log(`[HourlyRevenueJob] Completed for hour ${start.toISOString()}`);
  }
};
  