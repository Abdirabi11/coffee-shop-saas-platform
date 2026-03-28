import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"
import { redis } from "../../lib/redis.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

//if deploying to:
// - Traditional VPS (DigitalOcean, AWS EC2)
// - Kubernetes
// - Docker containers
// - Long-running Node.js processes

  
export class MenuCacheService {
    private static readonly CACHE_TTL = 3600; // 1 hour
    private static readonly CACHE_PREFIX = "menu";

    //Get full menu for store (with cache)
    static async getMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        checkAvailability?: boolean;
    }): Promise<any> {
        const cacheKey = this.getCacheKey(input.storeUuid);
      
        try {
            // Try cache first
            const cached = await redis.get(cacheKey);
            
            if (cached) {
                logWithContext("info", "[MenuCache] Cache hit", {
                    storeUuid: input.storeUuid,
                });
        
                MetricsService.increment("menu.cache.hit", 1, {
                    storeUuid: input.storeUuid,
                });
        
                return JSON.parse(cached);
            }
        
            // Cache miss - fetch from database
            logWithContext("info", "[MenuCache] Cache miss - fetching from DB", {
                storeUuid: input.storeUuid,
            });

            MetricsService.increment("menu.cache.miss", 1, {
                storeUuid: input.storeUuid,
            });
    
            const menu = await this.buildMenu(input);
    
            // Store in cache
            await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(menu));
    
            return menu;
    
        } catch (error: any) {
            logWithContext("error", "[MenuCache] Cache operation failed", {
                error: error.message,
                storeUuid: input.storeUuid,
            });
    
            // Fallback to database
            return this.buildMenu(input);
        }
    }
  
    //Build menu from database
    private static async buildMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        checkAvailability?: boolean;
    }): Promise<any> {
        const startTime = Date.now();
    
        // Get all active products with relationships
        const products = await prisma.product.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                isActive: true,
                isDeleted: false,
                visibleOnMenu: true,
            },
            include: {
                category: true,
                optionGroups: {
                    where: { isActive: true },
                    include: {
                        options: {
                            where: { isActive: true },
                            orderBy: { displayOrder: "asc" },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                },
                inventory: true,
                availability: {
                    where: { isActive: true },
                },
            },
            orderBy: [
                { category: { displayOrder: "asc" } },
                { displayOrder: "asc" },
            ],
        });
  
        // Check availability if requested
        if (input.checkAvailability) {
            const now = new Date();
            
            for (const product of products) {
                // Check availability logic here
                const isAvailable = await this.checkProductAvailability(
                    product.uuid,
                    product.availability,
                    now
                );
                
                (product as any).currentlyAvailable = isAvailable;
            }
        }
  
      // Group by category
        const categorizedMenu = products.reduce((acc, product) => {
            const categoryName = product.category?.name || "Uncategorized";
            
            if (!acc[categoryName]) {
                acc[categoryName] = {
                    categoryUuid: product.categoryUuid,
                    categoryName,
                    products: [],
                };
            }
            
            acc[categoryName].products.push(product);
            
            return acc;
        }, {} as Record<string, any>);
  
        const menu = {
            storeUuid: input.storeUuid,
            categories: Object.values(categorizedMenu),
            totalProducts: products.length,
            lastUpdated: new Date().toISOString(),
        };
  
        const duration = Date.now() - startTime;
        MetricsService.timing("menu.build.duration", duration);
    
        logWithContext("info", "[MenuCache] Menu built", {
            storeUuid: input.storeUuid,
            productCount: products.length,
            durationMs: duration,
        });
    
        return menu;
    }

    //Check product availability
    private static async checkProductAvailability(
        productUuid: string,
        schedules: any[],
        now: Date
    ): Promise<boolean> {
        if (schedules.length === 0) {
            return true; // No schedules = always available
        }
    
        const day = now.getDay();
        const time = now.toTimeString().slice(0, 5);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
  
        // Check exceptions first
        for (const schedule of schedules.filter(s => s.isException)) {
            if (schedule.specificDate) {
                const scheduleDate = new Date(schedule.specificDate);
                scheduleDate.setHours(0, 0, 0, 0);
            
                if (today.getTime() === scheduleDate.getTime()) {
                    if (schedule.allDay) return false;
                    if (time >= schedule.startTime && time <= schedule.endTime) {
                        return false;
                    }
                }
            }
        };
  
        // Check regular schedules
        for (const schedule of schedules.filter(s => !s.isException)) {
            if (schedule.dayOfWeek === day) {
                if (schedule.allDay) return true;
                if (time >= schedule.startTime && time <= schedule.endTime) {
                    return true;
                }
            }
        };
    
        return false;
    }
  
    //Invalidate menu cache
    static async invalidate(storeUuid: string): Promise<void> {
        const cacheKey = this.getCacheKey(storeUuid);
        
        try {
            await redis.del(cacheKey);
            
            logWithContext("info", "[MenuCache] Cache invalidated", {
                storeUuid,
            });
    
            MetricsService.increment("menu.cache.invalidated", 1, {
                storeUuid,
            });
    
        } catch (error: any) {
            logWithContext("error", "[MenuCache] Failed to invalidate cache", {
                error: error.message,
                storeUuid,
            });
        }
    }
  
    //Warm up cache for store
    static async warmUp(input: {
        tenantUuid: string;
        storeUuid: string;
    }): Promise<void> {
        logWithContext("info", "[MenuCache] Warming up cache", {
            storeUuid: input.storeUuid,
        });
    
        await this.getMenu({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            checkAvailability: true,
        });
    }

    private static getCacheKey(storeUuid: string): string {
        return `${this.CACHE_PREFIX}:${storeUuid}`;
    }
  
    static async getStats(): Promise<any> {
        const info = await redis.info("stats");
        const keyspace = await redis.info("keyspace");
        
        return {
            info,
            keyspace,
        };
    }
}
  