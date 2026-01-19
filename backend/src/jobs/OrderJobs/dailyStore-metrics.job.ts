import prisma from "../../config/prisma.ts"

export class DailyStoreMetricsJob {
  static async run(date= new Date()){
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const stats= await prisma.order.groupBy({
      by: ["storeUuid"],
      where: {
        status: "COMPLETED",
        createdAt: {gte: start, lt: end}
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        uuid: true,
      },
    });

    for(const stat of stats){
      await prisma.dailyStoreMetrics.upsert({
        where: {
          date_storeUuid: {
            date: start,
            storeUuid: stat.storeUuid
          }
        },
        update: {
          revenue: stat._sum.totalAmount ?? 0,
          ordersCount: stat._count.uuid,
        },
        create: {
          date: start,
          storeUuid: stat.storeUuid,
          revenue: stat._sum.totalAmount ?? 0,
          ordersCount: stat._count.uuid,
        },
      })
    }
  };
};