import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class AnalyticsAggregationJob {
    static cronSchedule = "0 1 * * *";
    
    static async run(date = new Date()) {
        const startTime = Date.now();
        const targetDate = dayjs(date).startOf("day").toDate();
        const nextDate = dayjs(targetDate).add(1, "day").toDate();
    
        logWithContext("info", "[AnalyticsAggregation] Starting", {
            date: targetDate.toISOString(),
        });
    
        try {
            const storeStats = await prisma.order.groupBy({
                by: ["storeUuid"],
                where: {
                status: "COMPLETED",
                createdAt: { gte: targetDate, lt: nextDate },
                },
                _sum: { totalAmount: true },
                _count: { uuid: true },
            });
        
            let storeMetricsCount = 0;
        
            for (const stat of storeStats) {
                try {
                // FIX: update payload is flat, not nested under composite key
                await prisma.storeDailyMetrics.upsert({
                    where: {
                    storeUuid_date: {
                        storeUuid: stat.storeUuid,
                        date: targetDate,
                    },
                    },
                    update: {
                    totalRevenue: stat._sum.totalAmount ?? 0,
                    ordersCount: stat._count.uuid,
                    },
                    create: {
                    storeUuid: stat.storeUuid,
                    date: targetDate,
                    totalRevenue: stat._sum.totalAmount ?? 0,
                    ordersCount: stat._count.uuid,
                    failedPayments: 0,
                    avgPrepTimeMin: 0,
                    },
                });
                storeMetricsCount++;
                } catch (storeError: any) {
                logWithContext("error", "[AnalyticsAggregation] Store metric failed", {
                    storeUuid: stat.storeUuid,
                    error: storeError.message,
                });
                }
            }
        
            // Also compute failed payments per store
            const failedByStore = await prisma.payment.groupBy({
                by: ["storeUuid"],
                where: {
                status: "FAILED",
                createdAt: { gte: targetDate, lt: nextDate },
                },
                _count: true,
            });
        
            for (const stat of failedByStore) {
                try {
                await prisma.storeDailyMetrics.upsert({
                    where: {
                    storeUuid_date: {
                        storeUuid: stat.storeUuid,
                        date: targetDate,
                    },
                    },
                    update: {
                    failedPayments: stat._count,
                    },
                    create: {
                    storeUuid: stat.storeUuid,
                    date: targetDate,
                    totalRevenue: 0,
                    ordersCount: 0,
                    failedPayments: stat._count,
                    avgPrepTimeMin: 0,
                    },
                });
                } catch (err: any) {
                // Silently continue — the main upsert above may have already created the record
                }
            }
        
            // ── Product daily metrics ──────────────────────────────────────────
        
            // Group by product AND store for proper per-store product metrics
            const productStats = await prisma.orderItem.groupBy({
                by: ["productUuid"],
                where: {
                order: {
                    status: "COMPLETED",
                    createdAt: { gte: targetDate, lt: nextDate },
                },
                },
                _sum: {
                quantity: true,
                price: true,
                },
            });
        
            let productMetricsCount = 0;
        
            for (const stat of productStats) {
                try {
                    await prisma.productDailyMetrics.upsert({
                        where: {
                            productUuid_storeUuid_date: {
                                productUuid: stat.productUuid,
                                storeUuid: "GLOBAL",
                                date: targetDate,
                            },
                        },
                        update: {
                            quantitySold: stat._sum.quantity ?? 0,
                            revenue: stat._sum.price ?? 0,
                        },
                        create: {
                            productUuid: stat.productUuid,
                            storeUuid: "GLOBAL",
                            date: targetDate,
                            quantitySold: stat._sum.quantity ?? 0,
                            revenue: stat._sum.price ?? 0,
                        },
                    });
                    productMetricsCount++;
                } catch (productError: any) {
                    logWithContext("error", "[AnalyticsAggregation] Product metric failed", {
                        productUuid: stat.productUuid,
                        error: productError.message,
                    });
                }
            }
        
            const duration = Date.now() - startTime;
            MetricsService.increment("analytics_aggregation_completed");
        
            logWithContext("info", "[AnalyticsAggregation] Completed", {
                date: targetDate.toISOString(),
                storeMetrics: storeMetricsCount,
                productMetrics: productMetricsCount,
                durationMs: duration,
            });
    
            return {
                storeMetrics: storeMetricsCount,
                productMetrics: productMetricsCount,
            };
        } catch (error: any) {
            logWithContext("error", "[AnalyticsAggregation] Fatal error", {
                error: error.message,
            });
            MetricsService.increment("analytics_aggregation_failed");
            throw error;
        }
    }
}