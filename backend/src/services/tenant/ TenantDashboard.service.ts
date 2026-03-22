import { withAvailabilityCache } from "../../cache/withAvailabilityCache.s";
import { withCache } from "../cache/cache.ts";
import { getCacheVersion } from "../cache/cacheVersion.ts";
import prisma from "../config/prisma.ts"

export class TenantDashboardService {
    static async getDashboard(tenantUuid: string){
        const version = await getCacheVersion(`tenant:${tenantUuid}:dashboard`);
        const cacheKey= `tenant:${tenantUuid}:dashboard:v${version}`;

        withAvailabilityCache({
            prefix: "tenant-dashboard",
            entityUuid: tenantUuid,
            fetcher: () => TenantDashboardService.build(tenantUuid),
        });
        
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

export class AdminDashboardService {
    static async getDashboard() {
      const cacheKey = "admin:dashboard";
  
      return withCache(cacheKey, 60, async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
  
        const [
          revenue,
          ordersToday,
          failedPayments,
          activeStores,
        ] = await Promise.all([
          prisma.order.aggregate({
            where: { status: "COMPLETED" },
            _sum: { totalAmount: true },
          }),
  
          prisma.order.count({
            where: { createdAt: { gte: todayStart } },
          }),
  
          prisma.payment.count({
            where: { status: "FAILED" },
          }),
  
          prisma.store.count({
            where: { isActive: true },
          }),
        ]);
  
        return {
          totalRevenue: revenue._sum.totalAmount ?? 0,
          ordersToday,
          failedPayments,
          activeStores,
        };
      });
    }
};
  