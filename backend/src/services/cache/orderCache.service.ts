import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { redis } from "../../lib/redis.ts";

export class OrderCacheService{
    private static readonly TTL = {
        ACTIVE_ORDERS: 60, // 1 minute
        ORDER_DETAILS: 300, // 5 minutes
        STORE_STATS: 1800, // 30 minutes
        RECENT_ORDERS: 180, // 3 minutes
    };
    
    //Cache active orders for kitchen display
    static async getActiveOrders(input: {
        tenantUuid: string;
        storeUuid: string;
    }) {
        const cacheKey = `active-orders:${input.storeUuid}`;

        try {
            const cached = await redis.get(cacheKey);

            if (cached) {
                logWithContext("info", "[OrderCache] Active orders cache hit", {
                    storeUuid: input.storeUuid,
                });

                MetricsService.increment("order.cache.hit", 1, {
                    type: "active_orders",
                });

                return JSON.parse(cached);
            };

            // Cache miss - fetch from DB
            logWithContext("info", "[OrderCache] Active orders cache miss", {
                storeUuid: input.storeUuid,
            });

            MetricsService.increment("order.cache.miss", 1, {
                type: "active_orders",
            });

            const orders = await prisma.order.findMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    status: { in: ["PAID", "PREPARING", "READY"] },
                },
                include: {
                    items: {
                        include: { product: true },
                    },
                },
                orderBy: { createdAt: "asc" },
            });

            // Cache for 1 minute
            await redis.setex(cacheKey, this.TTL.ACTIVE_ORDERS, JSON.stringify(orders));

            return orders;
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to get active orders", {
                error: error.message,
            });
        
            // Fallback to DB
            return prisma.order.findMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    status: { in: ["PAID", "PREPARING", "READY"] },
                },
                include: {
                    items: {
                        include: { product: true },
                    },
                },
                orderBy: { createdAt: "asc" },
            });
        }
    }

    //Cache single order details
    static async getOrderDetails(input: {
        tenantUuid: string;
        orderUuid: string;
    }){
        const cacheKey = `order:${input.orderUuid}`;

        try {
            const cached = await redis.get(cacheKey);

            if (cached) {
                MetricsService.increment("order.cache.hit", 1, {
                    type: "order_details",
                });
                return JSON.parse(cached);
            }

            MetricsService.increment("order.cache.miss", 1, {
                type: "order_details",
            });

            const order = await prisma.order.findFirst({
                where: {
                    uuid: input.orderUuid,
                    tenantUuid: input.tenantUuid,
                },
                include: {
                    items: {
                        include: { product: true },
                    },
                    payments: true,
                    refunds: true,
                    statusHistory: {
                        orderBy: { createdAt: "desc" },
                    },
                    tenantUser: {
                        include: { user: true },
                    },
                },
            });

            if (order) {
                await redis.setex(
                    cacheKey,
                    this.TTL.ORDER_DETAILS,
                    JSON.stringify(order)
                );
            };
        
            return order;
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to get order details", {
                error: error.message,
            });
        
            return prisma.order.findFirst({
                where: {
                    uuid: input.orderUuid,
                    tenantUuid: input.tenantUuid,
                },
                include: {
                    items: { include: { product: true } },
                    payments: true,
                    statusHistory: true,
                },
            }); 
        }
    }

    //Cache store statistics
    static async getStoreStats(input: {
        tenantUuid: string;
        storeUuid: string;
    }) {
        const cacheKey = `store-stats:${input.storeUuid}`;
 
        try {
            const cached = await redis.get(cacheKey);
        
            if (cached) {
                MetricsService.increment("order.cache.hit", 1, {
                type: "store_stats",
                });
                return JSON.parse(cached);
            }
        
            MetricsService.increment("order.cache.miss", 1, {
                type: "store_stats",
            });
        
            // Calculate stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);
    
            const [todayOrders, todayRevenue, activeOrders] = await Promise.all([
                prisma.order.count({
                    where: {
                        storeUuid: input.storeUuid,
                        createdAt: { gte: today },
                    },
                }),
                prisma.order.aggregate({
                    where: {
                        storeUuid: input.storeUuid,
                        status: "COMPLETED",
                        createdAt: { gte: today },
                    },
                _sum: { totalAmount: true },
                }),
                prisma.order.count({
                    where: {
                        storeUuid: input.storeUuid,
                        status: { in: ["PAID", "PREPARING", "READY"] },
                    },
                }),
            ]);
        
            const stats = {
                todayOrders,
                todayRevenue: todayRevenue._sum.totalAmount || 0,
                activeOrders,
                cachedAt: new Date().toISOString(),
            };
        
            // Cache for 30 minutes
            await redis.setex(cacheKey, this.TTL.STORE_STATS, JSON.stringify(stats));
        
            return stats;
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to get store stats", {
                error: error.message,
            });
        
            return {
                todayOrders: 0,
                todayRevenue: 0,
                activeOrders: 0,
            };
        }
    }
 
    //Invalidate active orders cache
    static async invalidateActiveOrders(storeUuid: string) {
        const cacheKey = `active-orders:${storeUuid}`;
    
        try {
            await redis.del(cacheKey);
        
            logWithContext("info", "[OrderCache] Active orders cache invalidated", {
                storeUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to invalidate cache", {
                error: error.message,
            });
        }
    }
 
    //Invalidate order details cache
    static async invalidateOrderDetails(orderUuid: string) {
        const cacheKey = `order:${orderUuid}`;
    
        try {
            await redis.del(cacheKey);
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to invalidate order", {
                error: error.message,
            });
        }
    }
 
    //Invalidate store stats cache
    static async invalidateStoreStats(storeUuid: string) {
        const cacheKey = `store-stats:${storeUuid}`;
    
        try {
            await redis.del(cacheKey);
        } catch (error: any) {
            logWithContext("error", "[OrderCache] Failed to invalidate stats", {
                error: error.message,
            });
        }
    }
 
    //Invalidate all order-related caches for a store
    static async invalidateStoreCache(storeUuid: string) {
        await Promise.all([
            this.invalidateActiveOrders(storeUuid),
            this.invalidateStoreStats(storeUuid),
        ]);
    }
}