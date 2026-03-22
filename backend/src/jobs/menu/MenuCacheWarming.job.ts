import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MenuCacheService } from "../../services/menu/menuCache.service.ts";


export class MenuCacheWarmingJob {
  
    //Warm cache for all active stores
    static async run() {
        logWithContext("info", "[MenuCacheWarming] Starting cache warming");

        try {
            const stores = await prisma.store.findMany({
                where: { isActive: true },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    name: true,
                },
            });

            let warmed = 0;
            let errors = 0;

            for (const store of stores) {
                try {
                    await MenuCacheService.prewarmCache({
                        tenantUuid: store.tenantUuid,
                        storeUuid: store.uuid,
                    });

                    warmed++;

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[MenuCacheWarming] Failed to warm", {
                        storeUuid: store.uuid,
                        storeName: store.name,
                        error: error.message,
                    });
                }
            }

            logWithContext("info", "[MenuCacheWarming] Completed", {
                total: stores.length,
                warmed,
                errors,
            });

            return { warmed, errors };

        } catch (error: any) {
            logWithContext("error", "[MenuCacheWarming] Job failed", {
                error: error.message,
            });

            throw error;
        }
    }
}