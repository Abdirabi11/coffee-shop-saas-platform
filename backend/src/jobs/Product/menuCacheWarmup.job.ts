import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MenuCacheService } from "../../services/cache/menuCache.service.ts";


//Warm up menu cache for all active stores
//Runs every 6 hours
export class MenuCacheWarmupJob{
    static async run(){
        logWithContext("info", "[MenuCacheWarmup] Starting warmup");

        try {
            // Get all active stores
            const stores = await prisma.store.findMany({
                where: {
                    isActive: true,
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                },
            });
        
            let warmedUp = 0;
            let failed = 0;
    
            for (const store of stores) {
                try {
                    await MenuCacheService.warmUp({
                        tenantUuid: store.tenantUuid,
                        storeUuid: store.uuid,
                    });
            
                    warmedUp++;
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[MenuCacheWarmup] Failed to warm up cache", {
                        storeUuid: store.uuid,
                        error: error.message,
                    });
                }
            };
    
            logWithContext("info", "[MenuCacheWarmup] Warmup completed", {
                total: stores.length,
                warmedUp,
                failed,
            });
    
        } catch (error: any) {
            logWithContext("error", "[MenuCacheWarmup] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}
