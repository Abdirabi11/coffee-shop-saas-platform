import { withCache } from "../../cache/cache.js";
import { getCacheVersion } from "../cache/cacheVersion.ts";
import prisma from "../config/prisma.ts"

export class StoreDashboardService {
    static async getDashboard(storeUuid: string){
        const version= await getCacheVersion(`store:${storeUuid}:dashboard`);
        const cacheKey= `store:${storeUuid}:dashboard:v${version}`;

        return withCache(cacheKey, 60, async ()=>{
            const todayStart = new Date();
            const [
                activeOrders,
                revenue,
                failedPayments,
                prepStats,
            ]= await Promise.all([
                prisma.order.count({
                    where: { 
                        storeUuid, 
                        status: {
                            in: ["PENDING", "PAYMENT_PENDING", "PAID", "PREPARING"],
                        }
                    },
                }),

                prisma.order.aggregate({
                    where: { storeUuid, status: "COMPLETED",  createdAt: { gte: todayStart }, },
                    _sum: { totalPrice: true },
                }),

                prisma.payment.count({
                    where: { storeUuid, status: "FAILED",  createdAt: { gte: todayStart }, },
                }),
            
                prisma.$queryRaw<{ avg_minutes: number }[]>`
                    SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 60)
                    AS avg_minutes
                    FROM "Order"
                    WHERE "storeUuid" = ${storeUuid}
                    AND status = 'COMPLETED'
                `
            ]);

            return {
                orders: { active: activeOrders },
                revenue: revenue._sum.totalPrice ?? 0,
                failedPayments,
                avgPrepTimeMinutes: prepStats[0]?.avg_minutes ?? 0,
            };
        })
    }

    static async getActiveOrders(
        storeUuid: string,
        page = 1,
        limit = 10
    ){
        const skip = (page - 1) * limit;
        const cacheKey = `store:${storeUuid}:orders:active:page:${page}`;

        return withCache(cacheKey, 30 , async()=>{
            const [data, total] = await Promise.all([
                prisma.order.findMany({
                  where: { storeUuid, status: "IN_PROGRESS" },
                  orderBy: { createdAt: "desc" },
                  skip,
                  take: limit,
                }),
                prisma.order.count({
                  where: { storeUuid, status: "IN_PROGRESS" },
                }),
            ]);

            return {
                data,
                meta: {
                  page,
                  limit,
                  total,
                  pages: Math.ceil(total / limit),
                },
            };
        })
    }

    static async getPeakHours(storeUuid: string) {
        const cacheKey = `store:${storeUuid}:peak-hours`;
        return withCache(cacheKey, 300, async () => {
            const orders= await prisma.order.findMany({
                where: {storeUuid},
                select: { createdAt: true }
            });

            const hoursMap= new Map<number, number>();
            for(const order of orders){
                const hour = order.createdAt.getHours();
                hoursMap.set(hour, (hoursMap.get(hour) ?? 0) + 1);
            };

            return Array.from(hoursMap.entries())
              .map(([hour, orders]) => ({ hour, orders }))
              .sort((a, b) => b.orders - a.orders);
        }); 
    }
};