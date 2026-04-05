import dayjs from "dayjs";
import { prisma } from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class CategoryMetricsJob {

    //Calculate daily category metrics
    //Runs daily at 2:00 AM
    static async runDaily(date: Date = new Date()) {
        const yesterday = dayjs(date).subtract(1, "day").startOf("day").toDate();
        const today = dayjs(date).startOf("day").toDate();
    
        logWithContext("info", "[CategoryMetrics] Starting calculation", {
            date: yesterday.toISOString(),
        });
    
        try {
            // Get all stores
            const stores = await prisma.store.findMany({
                where: { active: true },
                select: { uuid: true, tenantUuid: true },
            });
    
            for (const store of stores) {
                await this.calculateStoreMetrics({
                    tenantUuid: store.tenantUuid,
                    storeUuid: store.uuid,
                    date: yesterday,
                });
            }
  
            logWithContext("info", "[CategoryMetrics] Calculation completed", {
                storesProcessed: stores.length,
            });
  
        } catch (error: any) {
            logWithContext("error", "[CategoryMetrics] Calculation failed", {
                error: error.message,
            });
    
            throw error;
        }
    }
  
    //Calculate metrics for single store
    private static async calculateStoreMetrics(input: {
        tenantUuid: string;
        storeUuid: string;
        date: Date;
    }) {
        const startOfDay = dayjs(input.date).startOf("day").toDate();
        const endOfDay = dayjs(input.date).endOf("day").toDate();
    
        // Get categories for store
        const categories = await prisma.category.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            },
            select: { uuid: true },
        });
  
        for (const category of categories) {
            // Get order items for this category
            const stats = await prisma.orderItem.aggregate({
                where: {
                    product: {
                        categoryUuid: category.uuid,
                    },
                    order: {
                        storeUuid: input.storeUuid,
                        status: "COMPLETED",
                        createdAt: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                    },
                },
                _sum: {
                    quantity: true,
                    finalPrice: true,
                },
                _count: {
                    uuid: true,
                },
            });
    
            // Get view count from Redis
            const viewKey = `category:views:${category.uuid}:${dayjs(input.date).format("YYYY-MM-DD")}`;
            const viewCount = parseInt((await redis.get(viewKey)) || "0");
    
            // Upsert metrics
            await prisma.categoryDailyMetrics.upsert({
                where: {
                    tenantUuid_categoryUuid_storeUuid_date: {
                        tenantUuid: input.tenantUuid,
                        categoryUuid: category.uuid,
                        storeUuid: input.storeUuid,
                        date: startOfDay,
                    },
                },
                update: {
                    itemsSold: stats._sum.quantity || 0,
                    revenue: stats._sum.finalPrice || 0,
                    ordersCount: stats._count.uuid || 0,
                    viewCount,
                    calculatedAt: new Date(),
                },
                create: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    categoryUuid: category.uuid,
                    date: startOfDay,
                    itemsSold: stats._sum.quantity || 0,
                    revenue: stats._sum.finalPrice || 0,
                    ordersCount: stats._count.uuid || 0,
                    viewCount,
                },
            });
        }
    }
}