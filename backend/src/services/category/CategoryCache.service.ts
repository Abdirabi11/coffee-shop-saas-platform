import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { redis } from "../../lib/redis.ts";
import { CategoryService } from "../category/category.service.ts";


export class CategoryCacheService {
    private static readonly TTL = 3600; // 1 hour
    private static readonly PREFIX = "category";

    private static key(tenantUuid: string, storeUuid: string, shape: "tree" | "flat") {
        return `tenant:${tenantUuid}:${this.PREFIX}:store:${storeUuid}:${shape}`;
    }
  
    //Get categories for store (with cache)
    static async getCategories(input: {
        tenantUuid: string;
        storeUuid: string;
        includeChildren?: boolean;
    }) {
        const cacheKey = this.key(input.tenantUuid, input.storeUuid, input.includeChildren ? "tree" : "flat");
  
        try {
            // Try cache first
            const cached = await redis.get<any>(cacheKey);
    
            if (cached !== null) {
                MetricsService.increment("category.cache.hit", 1);
        
                return cached;
            };
  
            // Cache miss - fetch from DB
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
    static async invalidate(tenantUuid: string, storeUuid: string) {
        try {
            const keys = [
                this.key(tenantUuid, storeUuid, "tree"),
                this.key(tenantUuid, storeUuid, "flat"),
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
  