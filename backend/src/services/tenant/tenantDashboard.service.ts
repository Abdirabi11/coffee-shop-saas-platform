import { withCache } from "../cache/cache.ts";
import { getCacheVersion } from "../cache/cacheVersion.ts";
import prisma from "../config/prisma.ts"

export class TenantDashboardService {
    static async getDashboard(tenantUuid: string){
        const version = await getCacheVersion(`tenant:${tenantUuid}:dashboard`);
        const cacheKey= `tenant:${tenantUuid}:dashboard:v${version}`;
        
        return withCache(cacheKey, 120, async ()=>{
            const [
                activeOrders,
                revenue,
                failedPayments,
                totalStores,
            ]= await Promise.all([
                prisma.order.count({where: {tenantUuid, status: "IN_PROGRESS"}}),
                prisma.payment.aggregate({ 
                    where: { tenantUuid, status: "SUCCESS"},
                    _sum: { amount: true },
                }),
                prisma.payment.count({ where: {tenantUuid, status: "FAILED"}}),
                prisma.store.count({ where: { tenantUuid } }),
            ]);

            return {
                orders: { active: activeOrders },
                revenue: revenue._sum.amount ?? 0,
                failedPayments,
                stores: totalStores,
            };
        })
    }
};