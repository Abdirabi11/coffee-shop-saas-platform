import { withCache } from "../../cache/cache.js";
import { getCacheVersion } from "../../cache/cacheVersion.ts"
import prisma from "../../config/prisma.ts"


export class StaffDashboardService{
    static async getActiveOrders(storeUuid: string){
        const version= await getCacheVersion(`store:${storeUuid}:active-orders`);
        const cacheKey= `store:${storeUuid}:active-orders:v${version}`;

        return withCache(cacheKey, 30, async () => {
            return prisma.order.findMany({
                where: {
                    storeUuid,
                    status: {
                        in: ["PAID", "PREPARING"]
                    }
                },
                select: {
                    uuid: true,
                    status: true,
                    createdAt: true,
                    items: {
                        select: {
                            product: { select: { name: true } },
                            quantity: true,
                        },
                    }
                },
                orderBy: { createdAt: "asc" },
            })
        })
    }
}