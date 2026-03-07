import { bumpCacheVersion, getCacheVersion } from "../../cache/cacheVersion.ts";
import { redis } from "../../lib/redis.ts";
import { MenuEventService } from "./menu-events.ts";
import { MenuPrewarmService } from "./menu-prewarm.service.ts";
import { MenuService } from "./menu.service.ts";


export class MenuCacheService {
    
    //Get cached menu or fetch fresh
    static async getMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        checkAvailability?: boolean;
    }) {
        const cacheKey = `menu:${input.storeUuid}`;
        const version = await getCacheVersion(cacheKey);
        
        try {
            // Try cache first
            const cached = await redis.get(`${cacheKey}:v${version}`);
            if (cached) {
                return JSON.parse(cached);
            }

            // Cache miss - fetch fresh
            const menu = await MenuService.getStoreMenu(input.storeUuid);
            
            // Cache for 5 minutes
            await redis.setex(
                `${cacheKey}:v${version}`,
                300,
                JSON.stringify(menu)
            );

            return menu;

        } catch (error) {
            console.error("[MenuCache] Get failed:", error);
            // Fallback to direct fetch
            return MenuService.getStoreMenu(input.storeUuid);
        }
    }

    //Invalidate menu cache
    static async invalidate(input: {
        tenantUuid: string;
        storeUuid: string;
        reason?: string;
        triggeredBy?: string;
    }) {
        const cacheKey = `menu:${input.storeUuid}`;
        
        try {
            // Bump version
            await bumpCacheVersion(cacheKey);

            // Emit event
            await MenuEventService.emit("MENU_INVALIDATED", {
                storeUuid: input.storeUuid,
                reason: input.reason,
                triggeredBy: input.triggeredBy,
            });

            // Prewarm
            await MenuPrewarmService.prewarmStoreMenu(input.storeUuid);

            return { success: true };

        } catch (error) {
            console.error("[MenuCache] Invalidate failed:", error);
            throw error;
        }
    }

    //Warm cache for store
    static async warm(storeUuid: string) {
        return MenuPrewarmService.prewarmStoreMenu(storeUuid);
    }
}