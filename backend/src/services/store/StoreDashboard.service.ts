import dayjs from "dayjs";
import { withCache } from "../../cache/cache.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { getCacheVersion } from "../cache/cacheVersion.ts";
import prisma from "../config/prisma.ts"

export class StoreDashboardService {
    //Real-time store operations view for managers
    static async getDashboard(tenantUuid: string, storeUuid: string) {
        const version = await getCacheVersion(`store:${storeUuid}:dashboard`);
        const cacheKey = `store:${storeUuid}:dashboard:v${version}`;
    
        return withCache(cacheKey, 30, async () => {
        // 30s TTL – managers need near-real-time
            const timer = MetricsService.startTimer("dashboard_build", { role: "manager" });
            try {
                const todayStart = dayjs().startOf("day").toDate();
        
                const [
                    revenueToday,
                    orderStats,
                    activeOrders,
                    orderQueue,
                    staffOnShift,
                    cashDrawers,
                    lowInventory,
                    hourlyRevenue,
                    tipsToday,
                    laborCost,
                ] = await Promise.all([
                    // Revenue
                    prisma.payment.aggregate({
                        where: { storeUuid, status: "SUCCESS", createdAt: { gte: todayStart } },
                        _sum: { amount: true },
                        _count: true,
                    }),
            
                    // Order summary
                    prisma.order.aggregate({
                        where: { storeUuid, createdAt: { gte: todayStart }, status: "COMPLETED" },
                        _count: true,
                        _avg: { totalAmount: true },
                    }),
        
                    // Active order count by status
                    prisma.order.groupBy({
                        by: ["status"],
                        where: {
                            storeUuid,
                            status: { in: ["PENDING", "IN_PROGRESS", "PREPARING", "READY"] },
                        },
                        _count: true,
                    }),
        
                    // Next 10 orders in queue (for KDS preview)
                    prisma.order.findMany({
                        where: {
                            storeUuid,
                            status: { in: ["PENDING", "IN_PROGRESS", "PREPARING"] },
                        },
                        select: {
                            uuid: true,
                            orderNumber: true,
                            status: true,
                            totalAmount: true,
                            createdAt: true,
                            items: {
                                select: { menuItem: { select: { name: true } }, quantity: true },
                            },
                        },
                        orderBy: { createdAt: "asc" },
                        take: 10,
                    }),
            
                    // Staff currently working
                    prisma.timeEntry.findMany({
                        where: { storeUuid, clockOut: null },
                        select: {
                            uuid: true,
                            clockIn: true,
                            tenantUser: {
                                select: {
                                    uuid: true,
                                    role: true,
                                    user: { select: { name: true } },
                                },
                            },
                            breaks: {
                                where: { endTime: null },
                                select: { startTime: true, breakType: true },
                            },
                        },
                    }),
        
                    // Cash drawer status
                    prisma.cashDrawer.findMany({
                        where: { storeUuid, status: { in: ["OPEN", "ACTIVE"] } },
                        select: {
                            uuid: true,
                            drawerNumber: true,
                            openingBalance: true,
                            currentBalance: true,
                            status: true,
                            assignedTo: { select: { user: { select: { name: true } } } },
                        },
                    }),
            
                    // Low inventory alerts
                    prisma.inventoryItem.findMany({
                        where: {
                            storeUuid,
                            currentStock: { lte: prisma.inventoryItem.fields.reorderPoint },
                        },
                        select: {
                            uuid: true,
                            name: true,
                            currentStock: true,
                            reorderPoint: true,
                            unit: true,
                        },
                        take: 10,
                    }),
        
                    // Hourly revenue breakdown for today
                    StoreDashboardService.getHourlyRevenue(storeUuid, todayStart),
            
                    // Tips collected today
                    prisma.tip.aggregate({
                        where: { storeUuid, createdAt: { gte: todayStart } },
                        _sum: { amount: true },
                    }),
            
                    // Labor cost today
                    StoreDashboardService.getLaborCostToday(storeUuid, todayStart),
                ]);
        
                // Build active orders by status map
                const ordersByStatus: Record<string, number> = {};
                for (const o of activeOrders) {
                    ordersByStatus[o.status] = o._count;
                };
        
                const revenue = revenueToday._sum.amount ?? 0;
        
                return {
                    revenue: {
                        today: revenue,
                        transactionCount: revenueToday._count,
                        averageOrderValue: Math.round((orderStats._avg.totalAmount ?? 0) * 100) / 100,
                        completedOrders: orderStats._count,
                    },
                    orders: {
                        byStatus: ordersByStatus,
                        totalActive: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),
                        queue: orderQueue.map((o) => ({
                            ...o,
                            waitTime: dayjs().diff(dayjs(o.createdAt), "minute"),
                        })),
                    },
                    staff: {
                        onShift: staffOnShift.map((entry) => ({
                            timeEntryUuid: entry.uuid,
                            name: entry.tenantUser.user.name,
                            role: entry.tenantUser.role,
                            clockedInAt: entry.clockIn,
                            hoursWorked: dayjs().diff(dayjs(entry.clockIn), "hour", true).toFixed(1),
                            onBreak: entry.breaks.length > 0,
                            breakType: entry.breaks[0]?.breakType ?? null,
                        })),
                        count: staffOnShift.length,
                    },
                    cashDrawers: cashDrawers.map((d) => ({
                        uuid: d.uuid,
                        drawerNumber: d.drawerNumber,
                        status: d.status,
                        openingBalance: d.openingBalance,
                        currentBalance: d.currentBalance,
                        assignedTo: d.assignedTo?.user.name ?? "Unassigned",
                    })),
                    inventory: {
                        lowStockAlerts: lowInventory,
                        alertCount: lowInventory.length,
                    },
                    hourlyRevenue,
                    tips: tipsToday._sum.amount ?? 0,
                    laborCost,
                    generatedAt: new Date().toISOString(),
                };
            } finally {
                timer.end();
            }
        });
    }
 
    //Hourly revenue chart data
    private static async getHourlyRevenue(storeUuid: string, since: Date) {
        const payments = await prisma.payment.findMany({
            where: { storeUuid, status: "SUCCESS", createdAt: { gte: since } },
            select: { amount: true, createdAt: true },
        });
    
        // Group by hour (0-23)
        const hourly: Record<number, number> = {};
        for (let h = 0; h <= 23; h++) hourly[h] = 0;
    
        for (const p of payments) {
            const hour = dayjs(p.createdAt).hour();
            hourly[hour] += p.amount;
        }
    
        return Object.entries(hourly).map(([hour, amount]) => ({
            hour: parseInt(hour),
            label: `${hour.padStart(2, "0")}:00`,
            revenue: amount,
        }));
    }
 
    //Labor cost ratio 
    private static async getLaborCostToday(storeUuid: string, since: Date) {
        // Sum hours * hourly rate for all shifts today
        const entries = await prisma.timeEntry.findMany({
            where: {
                storeUuid,
                clockIn: { gte: since },
            },
            select: {
                clockIn: true,
                clockOut: true,
                tenantUser: { select: { hourlyRate: true } },
            },
        });
    
        let totalCost = 0;
        for (const entry of entries) {
            const end = entry.clockOut ?? new Date();
            const hours = dayjs(end).diff(dayjs(entry.clockIn), "hour", true);
            totalCost += hours * (entry.tenantUser.hourlyRate ?? 0);
        }
    
        // Get revenue for ratio
        const revenue = await prisma.payment.aggregate({
            where: { storeUuid, status: "SUCCESS", createdAt: { gte: since } },
            _sum: { amount: true },
        });
    
        const rev = revenue._sum.amount ?? 0;
    
        return {
            totalCost: Math.round(totalCost * 100) / 100,
            revenue: rev,
            ratio: rev > 0 ? Math.round((totalCost / rev) * 100 * 100) / 100 : 0,
            status: rev > 0
                ? (totalCost / rev) * 100 <= 25
                ? "EXCELLENT"
                : (totalCost / rev) * 100 <= 35
                    ? "NORMAL"
                    : "HIGH"
                : "NO_REVENUE",
        };
    }
 
    static async invalidate(storeUuid: string) {
        await invalidateCacheVersion(`store:${storeUuid}:dashboard`);
        logWithContext("info", "[StoreDashboard] Cache invalidated", { storeUuid });
    }
}