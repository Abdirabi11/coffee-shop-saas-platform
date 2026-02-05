import prisma from "../../config/prisma.ts"

export class DailyStoreMetricsJob {
  static async run(date= new Date()){
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const stats= await prisma.order.groupBy({
      by: ["tenantUuid","storeUuid"],
      where: {
        status: "COMPLETED",
        createdAt: {gte: start, lt: end}
      },
      _sum: {
        totalAmount: true,
        taxAmount: true,
        discountAmount: true,
      },
      _count: {
        uuid: true,
      },
      _avg: {
        totalAmount: true,
      },
    });

    for(const stat of stats){
      const [uniqueCustomers, newCustomers, items] = await Promise.all([
        prisma.order.findMany({
          where: {
            tenantUuid: stat.tenantUuid,
            storeUuid: stat.storeUuid,
            status: "COMPLETED",
            createdAt: { gte: start, lt: end },
          },
          select: { tenantUserUuid: true },
          distinct: ["tenantUserUuid"],
        }),

        prisma.order.count({
          where: {
            tenantUuid: stat.tenantUuid,
            storeUuid: stat.storeUuid,
            status: "COMPLETED",
            createdAt: { gte: start, lt: end },
            tenantUser: {
              createdAt: { gte: start, lt: end },
            },
          },
        }),

        prisma.orderItem.aggregate({
          where: {
            order: {
              tenantUuid: stat.tenantUuid,
              storeUuid: stat.storeUuid,
              status: "COMPLETED",
              createdAt: { gte: start, lt: end },
            },
          },
          _sum: { quantity: true },
          _avg: { quantity: true },
        }),
      ]);

      // Get previous day for comparison
      const prevDayStart = new Date(start);
      prevDayStart.setDate(prevDayStart.getDate() - 1);
      const prevDayEnd = new Date(start);

      const prevDayStats = await prisma.order.aggregate({
        where: {
          tenantUuid: stat.tenantUuid,
          storeUuid: stat.storeUuid,
          status: "COMPLETED",
          createdAt: { gte: prevDayStart, lt: prevDayEnd },
        },
        _sum: { totalAmount: true },
      });

      const prevDayRevenue = prevDayStats._sum.totalAmount ?? 0;
      const currentRevenue = stat._sum.totalAmount ?? 0;
      const changePercent = prevDayRevenue > 0
        ? ((currentRevenue - prevDayRevenue) / prevDayRevenue) * 100
        : 0;
      
      // Upsert metrics (correct table name: OrderMetricsDaily)
      await prisma.orderMetricsDaily.upsert({
        where: {
          tenantUuid_storeUuid_date: {
            tenantUuid: stat.tenantUuid,
            storeUuid: stat.storeUuid,
            date: start,
          },
        },
        update: {
          ordersTotal: stat._count.uuid,
          ordersCompleted: stat._count.uuid,
          revenueGross: currentRevenue,
          revenueNet: currentRevenue - (stat._sum.discountAmount ?? 0),
          revenueTax: stat._sum.taxAmount ?? 0,
          revenueDiscount: stat._sum.discountAmount ?? 0,
          avgOrderValue: Math.round(stat._avg.totalAmount ?? 0),
          avgItemsPerOrder: items._avg.quantity ?? 0,
          uniqueCustomers: uniqueCustomers.length,
          newCustomers,
          returningCustomers: uniqueCustomers.length - newCustomers,
          prevDayRevenue,
          changePercent,
          isCalculated: true,
          calculatedAt: new Date(),
        },
        create: {
          tenantUuid: stat.tenantUuid,
          storeUuid: stat.storeUuid,
          date: start,
          ordersTotal: stat._count.uuid,
          ordersCompleted: stat._count.uuid,
          revenueGross: currentRevenue,
          revenueNet: currentRevenue - (stat._sum.discountAmount ?? 0),
          revenueTax: stat._sum.taxAmount ?? 0,
          revenueDiscount: stat._sum.discountAmount ?? 0,
          avgOrderValue: Math.round(stat._avg.totalAmount ?? 0),
          avgItemsPerOrder: items._avg.quantity ?? 0,
          uniqueCustomers: uniqueCustomers.length,
          newCustomers,
          returningCustomers: uniqueCustomers.length - newCustomers,
          prevDayRevenue,
          changePercent,
          isCalculated: true,
          calculatedAt: new Date(),
        },
      })
    }
    console.log(`[DailyStoreMetricsJob] Calculated metrics for ${stats.length} stores`);
  };
};