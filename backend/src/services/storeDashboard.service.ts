import { withCache } from "../cache/cache.js";
import { getCacheVersion } from "../cache/cacheVersion.ts";
import prisma from "../config/prisma.ts"

export class StoreDashboardService {
    static async getDashboard(storeUuid: string){
        const version= await getCacheVersion(`store:${storeUuid}:dashboard`);
        const cacheKey= `store:${storeUuid}:dashboard:v${version}`;

        return withCache(cacheKey, 60, async ()=>{
            const [
                activeOrders,
                revenue,
                failedPayments,
            ]= await Promise.all([
                prisma.order.count({
                    where: { storeUuid, status: "IN_PROGRESS" },
                }),
                prisma.order.aggregate({
                    where: { storeUuid, status: "COMPLETED" },
                    _sum: { totalPrice: true },
                }),
                prisma.payment.count({
                    where: { storeUuid, status: "FAILED" },
                }),
            ]);

            return {
                orders: { active: activeOrders },
                revenue: revenue._sum.totalPrice ?? 0,
                failedPayments,
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
        return prisma.$queryRaw`
          SELECT 
            EXTRACT(HOUR FROM "createdAt") AS hour,
            COUNT(*)::int AS orders
          FROM "Order"
          WHERE "storeUuid" = ${storeUuid}
          GROUP BY hour
          ORDER BY orders DESC;
        `;
    }
}