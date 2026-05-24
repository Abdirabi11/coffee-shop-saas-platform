import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { redis } from "../../lib/redis.ts";
import { CategoryService } from "../category/category.service.ts";


export class CategoryCacheService {
    private static readonly TTL = 3600; // 1 hour
    private static readonly PREFIX = "category";
  
    //Get categories for store (with cache)
    static async getCategories(input: {
        tenantUuid: string;
        storeUuid: string;
        includeChildren?: boolean;
    }) {
        const cacheKey = `${this.PREFIX}:store:${input.storeUuid}:${input.includeChildren ? "tree" : "flat"}`;
  
        try {
            // Try cache first
            const cached = await redis.get(cacheKey);
    
            if (cached) {
                logWithContext("debug", "[CategoryCache] Cache hit", {
                    storeUuid: input.storeUuid,
                });
        
                MetricsService.increment("category.cache.hit", 1);
        
                return JSON.parse(cached);
            };
  
            // Cache miss - fetch from DB
            logWithContext("debug", "[CategoryCache] Cache miss", {
                storeUuid: input.storeUuid,
            });
    
            MetricsService.increment("category.cache.miss", 1);
    
            const categories = await CategoryService.list({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                includeChildren: input.includeChildren,
                onlyVisible: true,
            });
    
            // Cache for 1 hour
            await redis.setex(cacheKey, this.TTL, JSON.stringify(categories));
    
            return categories;
  
      } catch (error: any) {
            logWithContext("error", "[CategoryCache] Cache error", {
                error: error.message,
            });
    
            // Fallback to DB
            return CategoryService.list({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                includeChildren: input.includeChildren,
                onlyVisible: true,
            });
        }
    }
  
    //Invalidate category cache
    static async invalidate(storeUuid: string) {
        try {
            const keys = [
                `${this.PREFIX}:store:${storeUuid}:tree`,
                `${this.PREFIX}:store:${storeUuid}:flat`,
            ];
    
            for (const key of keys) {
                await redis.del(key);
            }
    
            logWithContext("info", "[CategoryCache] Cache invalidated", {
                storeUuid,
            });
  
        } catch (error: any) {
            logWithContext("error", "[CategoryCache] Failed to invalidate cache", {
                error: error.message,
            });
        }
    }
}
  