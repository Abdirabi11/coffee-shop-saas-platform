import { bumpCacheVersion, getCacheVersion } from "../../cache/cacheVersion.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { MenuEventService } from "../../events/menu.events.js";
import { MenuService } from "./menu.service.ts";
import { MenuSnapshotService } from "./menuSnapshot.service.ts";


export class MenuCacheService {
    
    static async invalidate(input: {
        tenantUuid: string;
        storeUuid: string;
        reason?: string;
        triggeredBy?: string;
    }) {
        try {
            const startTime = Date.now();

            // 1. Bump cache version
            await bumpCacheVersion(`menu:${input.storeUuid}`);

            logWithContext("info", "[MenuCache] Cache invalidated", {
                storeUuid: input.storeUuid,
                reason: input.reason,
                triggeredBy: input.triggeredBy,
            });

            // 2. Emit event
            await MenuEventService.emit("MENU_INVALIDATED", {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                reason: input.reason,
                triggeredBy: input.triggeredBy,
            });

            // 3. Prewarm cache immediately (async)
            this.prewarmCache({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            }).catch((error) => {
                logWithContext("error", "[MenuCache] Prewarm failed", {
                    error: error.message,
                });
            });

            // 4. Create snapshot (async)
            MenuSnapshotService.createSnapshot({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                reason: (input.reason as any) || "MANUAL",
                triggeredBy: input.triggeredBy,
            }).catch((error) => {
                logWithContext("error", "[MenuCache] Snapshot failed", {
                    error: error.message,
                });
            });

            const duration = Date.now() - startTime;
            MetricsService.histogram("menu.cache.invalidate.duration", duration);

            return { success: true };

        } catch (error: any) {
            logWithContext("error", "[MenuCache] Invalidate failed", {
                storeUuid: input.storeUuid,
                error: error.message,
            });

            MetricsService.increment("menu.cache.invalidate.error");

            throw error;
        }
    }

    static async prewarmCache(input: {
        tenantUuid: string;
        storeUuid: string;
    }) {
        try {
            logWithContext("info", "[MenuCache] Prewarming cache", {
                storeUuid: input.storeUuid,
            });

            // Fetch menu (this will populate cache)
            await MenuService.getStoreMenu({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                includeUnavailable: false,
            });

            // Also warm "all" version
            await MenuService.getStoreMenu({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                includeUnavailable: true,
            });

            await MenuEventService.emit("MENU_PREWARMED", {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            });

            logWithContext("info", "[MenuCache] Cache prewarmed", {
                storeUuid: input.storeUuid,
            });

            MetricsService.increment("menu.cache.prewarm.success");

        } catch (error: any) {
            logWithContext("error", "[MenuCache] Prewarm failed", {
                storeUuid: input.storeUuid,
                error: error.message,
            });

            MetricsService.increment("menu.cache.prewarm.error");

            throw error;
        }
    }

    //Get cache statistics
    static async getStats(storeUuid: string) {
        try {
            const metadata = await prisma.menuCacheMetadata.findUnique({
                where: { storeUuid },
            });

            if (!metadata) {
                return {
                    storeUuid,
                    currentVersion: 1,
                    cacheHits: 0,
                    cacheMisses: 0,
                    hitRate: 0,
                };
            };

            const total = metadata.cacheHits + metadata.cacheMisses;
            const hitRate = total > 0 ? (metadata.cacheHits / total) * 100 : 0;

            return {
                storeUuid,
                currentVersion: metadata.currentVersion,
                cacheHits: metadata.cacheHits,
                cacheMisses: metadata.cacheMisses,
                hitRate: hitRate.toFixed(2),
                avgLoadTime: metadata.avgLoadTime,
                lastInvalidated: metadata.lastInvalidated,
                lastWarmed: metadata.lastWarmed,
            };
        } catch (error: any) {
            logWithContext("error", "[MenuCache] Get stats failed", {
                error: error.message,
            });

            throw error;
        }
    }
}