import prisma from "../../config/prisma.ts"

export class ProductPopularityJob{
    static async runDaily(date = new Date()) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
  
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
  
      const stats = await prisma.orderItem.groupBy({
        by: ["productUuid"],
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
        await prisma.productDailyPopularity.upsert({
          where: {
            productUuid_date: {
              productUuid: stat.productUuid,
              date: start,
            },
          },
          update: {
            quantitySold: stat._sum.quantity ?? 0,
            revenue: stat._sum.price ?? 0,
          },
          create: {
            productUuid: stat.productUuid,
            date: start,
            quantitySold: stat._sum.quantity ?? 0,
            revenue: stat._sum.price ?? 0,
          },
        });
      }
    }
};