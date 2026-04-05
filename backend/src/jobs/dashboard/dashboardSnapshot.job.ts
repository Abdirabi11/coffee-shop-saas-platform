import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import prisma from "../../config/prisma.ts"

export class DashboardSnapshotJob {
    static cronSchedule = "55 23 * * *";
 
    static async execute() {
        const startTime = Date.now();
        logWithContext("info", "[DashboardSnapshotJob] Starting daily snapshot");
 
        try {
            const tenants = await prisma.tenant.findMany({
                where: { active: true },
                select: { uuid: true },
            });
        
            const todayStart = dayjs().startOf("day").toDate();
            const todayEnd = dayjs().endOf("day").toDate();
        
            let snapshotCount = 0;
        
            for (const tenant of tenants) {
                try {
                    // Tenant-level daily snapshot
                    const [revenue, orders, newCustomers, failedPayments] = await Promise.all([
                        prisma.payment.aggregate({
                            where: {
                                tenantUuid: tenant.uuid,
                                status: "SUCCESS",
                                createdAt: { gte: todayStart, lte: todayEnd },
                            },
                            _sum: { amount: true },
                            _count: true,
                        }),
                        prisma.order.aggregate({
                            where: {
                                tenantUuid: tenant.uuid,
                                status: "COMPLETED",
                                createdAt: { gte: todayStart, lte: todayEnd },
                            },
                            _count: true,
                            _avg: { totalAmount: true },
                        }),
                        prisma.order.findMany({
                            where: {
                                tenantUuid: tenant.uuid,
                                status: "COMPLETED",
                                createdAt: { gte: todayStart, lte: todayEnd },
                            },
                            select: { customerUuid: true },
                            distinct: ["customerUuid"],
                        }),
                        prisma.payment.count({
                            where: {
                                tenantUuid: tenant.uuid,
                                status: "FAILED",
                                createdAt: { gte: todayStart, lte: todayEnd },
                            },
                        }),
                    ]);
        
                    await prisma.dashboardSnapshot.create({
                        data: {
                            tenantUuid: tenant.uuid,
                            date: todayStart,
                            type: "DAILY",
                            data: {
                                revenue: revenue._sum.amount ?? 0,
                                transactionCount: revenue._count,
                                completedOrders: orders._count,
                                averageOrderValue: Math.round((orders._avg.totalAmount ?? 0) * 100) / 100,
                                uniqueCustomers: newCustomers.length,
                                failedPayments,
                            },
                        },
                    });
        
                    snapshotCount++;
            
                    // Per-store snapshots
                    const stores = await prisma.store.findMany({
                        where: { tenantUuid: tenant.uuid, isActive: true },
                        select: { uuid: true },
                    });
        
                    for (const store of stores) {
                        const storeRevenue = await prisma.payment.aggregate({
                        where: {
                            storeUuid: store.uuid,
                            status: "SUCCESS",
                            createdAt: { gte: todayStart, lte: todayEnd },
                        },
                        _sum: { amount: true },
                        _count: true,
                        });
            
                        const storeOrders = await prisma.order.count({
                        where: {
                            storeUuid: store.uuid,
                            status: "COMPLETED",
                            createdAt: { gte: todayStart, lte: todayEnd },
                        },
                        });
            
                        await prisma.dashboardSnapshot.create({
                            data: {
                                tenantUuid: tenant.uuid,
                                storeUuid: store.uuid,
                                date: todayStart,
                                type: "DAILY_STORE",
                                data: {
                                    revenue: storeRevenue._sum.amount ?? 0,
                                    transactionCount: storeRevenue._count,
                                    completedOrders: storeOrders,
                                },
                            },
                        });
            
                        snapshotCount++;
                    }
                } catch (tenantError: any) {
                    logWithContext("error", "[DashboardSnapshotJob] Tenant snapshot failed", {
                        tenantUuid: tenant.uuid,
                        error: tenantError.message,
                    });
                    // Continue with next tenant
                }
            }
        
            const duration = Date.now() - startTime;
            MetricsService.increment("dashboard_snapshot_completed", { count: snapshotCount });
            logWithContext("info", "[DashboardSnapshotJob] Completed", {
                snapshots: snapshotCount,
                tenants: tenants.length,
                durationMs: duration,
            });
        } catch (error: any) {
            logWithContext("error", "[DashboardSnapshotJob] Fatal error", {
                error: error.message,
            });
            MetricsService.increment("dashboard_snapshot_failed");
        }
    }
}