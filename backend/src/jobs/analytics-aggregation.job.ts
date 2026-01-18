import prisma from "../config/prisma.ts"

export class AnalyticsAggregationJob{
    static async run(date= new Date()){
        const start= new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const storeStats= await prisma.order.groupBy({
            by: ["storeUuid"],
            where: {
                status: "COMPLETED",
                createdAt: {gte: start, lt: end}
            },
            _sum: {totalAmount: true},
            _count: { uuid: true },
        });

        for (const stat of storeStats){
            await prisma.storeDailyMetrics.upsert({
                where: {
                    storeUuid_date: {
                        storeUuid: stat.storeUuid,
                        date: start
                    }
                },
                update: {
                    storeUuid_date: {
                        totalRevenue: stat._sum.totalAmount ?? 0,
                        ordersCount: stat._count.uuid,
                    }
                },
                create: {
                    storeUuid: stat.storeUuid,
                    date: start,
                    totalRevenue: stat._sum.totalAmount ?? 0,
                    ordersCount: stat._count.uuid,
                    failedPayments: 0,
                    avgPrepTimeMin: 0,
                },
            })
        };

        const productStats= await prisma.orderItem.groupBy({
            by: ["productUuid"],
            where: {
                order: {
                    status: "COMPLETED",
                    createdAt: { gte: start, lt: end },
                }
            },
            _sum: {
                quantity: true,
                price: true,
            },
        });

        for (const stat of productStats){
            await prisma.productDailyMetrics.upsert({
                where: {
                    productUuid_storeUuid_date: {
                        productUuid: stat.productUuid,
                        storeUuid: "GLOBAL", 
                        date: start,
                    }
                },
                update: {
                    quantitySold: stat._sum.quantity ?? 0,
                    revenue: stat._sum.price ?? 0,
                },
                create: {
                    productUuid: stat.productUuid,
                    storeUuid: "GLOBAL",
                    date: start,
                    quantitySold: stat._sum.quantity ?? 0,
                    revenue: stat._sum.price ?? 0,
                },
            })
        };
    }
};