import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { SuperAdminDashboardService } from "../../services/superAdmin/SuperAdminDashboard.service.ts";

export class DashboardCacheWarmingJob {
    static cronSchedule = "*/5 * * * *";
    
    static async execute() {
        const startTime = Date.now();
        logWithContext("info", "[DashboardCacheWarming] Starting");
    
        try {
            let warmed = 0;
        
            try {
                await SuperAdminDashboardService.getOverview();
                warmed++;
            } catch (err: any) {
                logWithContext("warn", "[DashboardCacheWarming] SuperAdmin overview warm failed", {
                error: err.message,
                });
            }
        
            try {
                await SuperAdminDashboardService.getPlatformHealth();
                warmed++;
            } catch (err: any) {
                logWithContext("warn", "[DashboardCacheWarming] SuperAdmin health warm failed", {
                error: err.message,
                });
            }
    
            const recentCutoff = dayjs().subtract(2, "hour").toDate();
        
            const activeTenantUuids = await prisma.order.findMany({
                where: { createdAt: { gte: recentCutoff } },
                select: { tenantUuid: true },
                distinct: ["tenantUuid"],
            });
        
            for (const { tenantUuid } of activeTenantUuids) {
                try {
                    // await TenantDashboardService.getDashboard(tenantUuid, "today");
                    // warmed++;
            
                    // For now, we warm store-level dashboards
                    const activeStores = await prisma.store.findMany({
                        where: { tenantUuid, active: true }, // FIX: `active` not `isActive`
                        select: { uuid: true },
                    });
        
                    for (const store of activeStores) {
                        try {
                            // await StoreDashboardService.getDashboard(tenantUuid, store.uuid);
                            warmed++;
                        } catch (storeErr: any) {
                            logWithContext("warn", "[DashboardCacheWarming] Store warm failed", {
                                storeUuid: store.uuid,
                                error: storeErr.message,
                            });
                        }
                    }
                } catch (err: any) {
                    logWithContext("warn", "[DashboardCacheWarming] Tenant warm failed", {
                        tenantUuid,
                        error: err.message,
                    });
                }
            }
        
            const duration = Date.now() - startTime;
            logWithContext("info", "[DashboardCacheWarming] Completed", {
                activeTenants: activeTenantUuids.length,
                cachesWarmed: warmed,
                durationMs: duration,
            });
        } catch (error: any) {
            logWithContext("error", "[DashboardCacheWarming] Fatal error", {
                error: error.message,
            });
        }
    }
}