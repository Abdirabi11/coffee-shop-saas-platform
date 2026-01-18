import prisma from "../../config/prisma.ts"

//🔴 OrderMetricsJob — TOO MUCH RESPONSIBILITY ❌
// This job does:
// Daily metrics
// Hourly metrics
// Raw SQL
// Grouping logic
// ❌ Violates SRP
// 👉 Should be split into:
// DailyStoreMetricsJob
// HourlyRevenueJob
// ProductPopularityJob (already exists)

export class OrderMetricsJob {
    static async runDaily(date: Date) {
      const start= new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const orders= await prisma.order.findMany({
        where: {
          status: "COMPLETED",
          createdAt: { gte: start, lt: end, },
        }
      });

      const grouped = new Map<string, { revenue: number; orders: number }>();

      for(const order of orders){
        const entry= grouped.get(order.storeUuid) ?? {
          revenue: 0,
          orders: 0
        }

        entry.revenue += order.totalAmount;
        entry.orders += 1;
  
        grouped.set(order.storeUuid, entry);
      };

      for(const [storeUuid, data] of grouped){
        await prisma.dailyStoreMetrics.upsert({
          where: {
            date_storeUuid: {
              date: start,
              storeUuid,
            },
          },
          update: data,
          create: {
            date: start,
            storeUuid,
            ...data,
          },
        })
      }
    };

    static async run(date: Date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
  
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
  
      const orders = await prisma.order.findMany({
        where: {
          status: "COMPLETED",
          createdAt: { gte: start, lt: end },
        },
      });
  
      const map = new Map<string, { revenue: number; orders: number }>();
  
      for (const o of orders) {
        const entry = map.get(o.storeUuid) ?? { revenue: 0, orders: 0 };
        entry.revenue += o.totalAmount;
        entry.orders++;
        map.set(o.storeUuid, entry);
      }
  
      for (const [storeUuid, data] of map) {
        await prisma.dailyStoreMetrics.upsert({
          where: {
            date_storeUuid: { date: start, storeUuid },
          },
          update: data,
          create: { date: start, storeUuid, ...data },
        });
      }
    }
};