import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import { withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

type TimeRange = "today" | "week" | "month" | "quarter" | "year";
 
interface DashboardFilters {
    tenantUuid: string;
    storeUuid?: string;
    timeRange?: TimeRange;
}
 
interface RevenueBreakdown {
    total: number;
    cash: number;
    card: number;
    mobileMoney: number;
    averageOrderValue: number;
}
 
interface StoreSnapshot {
    storeUuid: string;
    storeName: string;
    revenue: number;
    orderCount: number;
    staffOnShift: number;
    activeOrders: number;
}
interface TopProduct {
    menuItemUuid: string;
    name: string;
    quantity: number;
    revenue: number;
}
 
function getTimeRangeStart(range: TimeRange): Date {
    const now = dayjs();
    switch (range) {
        case "today":
            return now.startOf("day").toDate();
        case "week":
            return now.startOf("week").toDate();
        case "month":
            return now.startOf("month").toDate();
        case "quarter":
            return now.subtract(3, "month").startOf("month").toDate();
        case "year":
            return now.startOf("year").toDate();
    }
}
 
function getCacheTTL(range: TimeRange): number {
    switch (range) {
        case "today":
            return 60; // 1 min – real-time feel
        case "week":
            return 300; // 5 min
        case "month":
            return 600; // 10 min
        case "quarter":
        case "year":
            return 1800; // 30 min
    }
}
 
function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}
 
export class TenantDashboardService {
    //Main dashboard: revenue, orders, stores, staff, top products
    static async getDashboard(tenantUuid: string, timeRange: TimeRange = "today") {
        const version = await getCacheVersion(`tenant:${tenantUuid}:dashboard`);
        const cacheKey = `tenant:${tenantUuid}:dashboard:${timeRange}:v${version}`;
        const ttl = getCacheTTL(timeRange);
    
        return withCache(cacheKey, ttl, async () => {
            const timer = MetricsService.startTimer("dashboard_build", { role: "tenant_admin" });
            try {
                const rangeStart = getTimeRangeStart(timeRange);
                const previousRangeStart = dayjs(rangeStart)
                    .subtract(dayjs().diff(dayjs(rangeStart), "day"), "day")
                    .toDate();
        
                const [
                    overview,
                    previousRevenue,
                    revenueBreakdown,
                    storeSnapshots,
                    topProducts,
                    staffSummary,
                    recentOrders,
                ] = await Promise.all([
                    TenantDashboardService.buildOverview(tenantUuid, rangeStart),
                    TenantDashboardService.getRevenue(tenantUuid, previousRangeStart, rangeStart),
                    TenantDashboardService.getRevenueBreakdown(tenantUuid, rangeStart),
                    TenantDashboardService.getStoreSnapshots(tenantUuid, rangeStart),
                    TenantDashboardService.getTopProducts(tenantUuid, rangeStart, 10),
                    TenantDashboardService.getStaffSummary(tenantUuid),
                    TenantDashboardService.getRecentOrders(tenantUuid, 20),
                ]);
        
                return {
                    timeRange,
                    overview: {
                        ...overview,
                        revenueChange: percentChange(
                            overview.revenue,
                            previousRevenue
                        ),
                    },
                    revenueBreakdown,
                    stores: storeSnapshots,
                    topProducts,
                    staff: staffSummary,
                    recentOrders,
                    generatedAt: new Date().toISOString(),
                };
            } finally {
                timer.end();
            }
        });
    }
 
    //Core metrics
    private static async buildOverview(tenantUuid: string, since: Date) {
        const [
            totalRevenue,
            orderStats,
            activeOrders,
            failedPayments,
            totalStores,
        ] = await Promise.all([
            prisma.payment.aggregate({
                where: { tenantUuid, status: "SUCCESS", createdAt: { gte: since } },
                _sum: { amount: true },
            }),
    
            prisma.order.aggregate({
                where: { tenantUuid, createdAt: { gte: since }, status: "COMPLETED" },
                _count: true,
                _avg: { totalAmount: true },
            }),
        
            prisma.order.count({
                where: {
                    tenantUuid,
                    status: { in: ["PENDING", "IN_PROGRESS", "PREPARING"] },
                },
            }),
        
            prisma.payment.count({
                where: { tenantUuid, status: "FAILED", createdAt: { gte: since } },
            }),
        
            prisma.store.count({ where: { tenantUuid, active: true } }),
        ]);
    
        return {
            revenue: totalRevenue._sum.amount ?? 0,
            completedOrders: orderStats._count,
            averageOrderValue: Math.round((orderStats._avg.totalAmount ?? 0) * 100) / 100,
            activeOrders,
            failedPayments,
            totalStores,
        };
    }
 
    private static async getRevenue(
        tenantUuid: string,
        from: Date,
        to: Date
    ): Promise<number> {
        const result = await prisma.payment.aggregate({
            where: {
                tenantUuid,
                status: "SUCCESS",
                createdAt: { gte: from, lt: to },
            },
            _sum: { amount: true },
        });
        return result._sum.amount ?? 0;
    }
 
    //Revenue by payment method
    private static async getRevenueBreakdown(
        tenantUuid: string,
        since: Date
    ): Promise<RevenueBreakdown> {
        const grouped = await prisma.payment.groupBy({
            by: ["paymentMethod"],
            where: { tenantUuid, status: "SUCCESS", createdAt: { gte: since } },
            _sum: { amount: true },
            _count: true,
        });
    
        let cash = 0;
        let card = 0;
        let mobileMoney = 0;
        let totalOrders = 0;
    
        for (const g of grouped) {
            const amount = g._sum.amount ?? 0;
            totalOrders += g._count;
        
            switch (g.paymentMethod) {
                case "CASH":
                    cash = amount;
                break;
                case "CARD":
                case "STRIPE":
                    card += amount;
                break;
                case "EVC_PLUS":
                case "MOBILE_MONEY":
                    mobileMoney += amount;
                break;
            }
        }
    
        const total = cash + card + mobileMoney;
    
        return {
            total,
            cash,
            card,
            mobileMoney,
            averageOrderValue: totalOrders > 0 ? Math.round((total / totalOrders) * 100) / 100 : 0,
        };
    }
 
    //Per-store health
    private static async getStoreSnapshots(
        tenantUuid: string,
        since: Date
    ): Promise<StoreSnapshot[]> {
        const stores = await prisma.store.findMany({
            where: { tenantUuid, active: true },
            select: { uuid: true, name: true },
        });
    
        const storeUuids = stores.map((s) => s.uuid);
    
        // Revenue per store
        const revenueByStore = await prisma.payment.groupBy({
            by: ["storeUuid"],
            where: {
                tenantUuid,
                status: "SUCCESS",
                storeUuid: { in: storeUuids },
                createdAt: { gte: since },
            },
            _sum: { amount: true },
            _count: true,
        });
    
        // Active orders per store
        const activeByStore = await prisma.order.groupBy({
            by: ["storeUuid"],
            where: {
                tenantUuid,
                storeUuid: { in: storeUuids },
                status: { in: ["PENDING", "IN_PROGRESS", "PREPARING"] },
            },
            _count: true,
        });
    
        // Staff currently clocked in per store
        const staffByStore = await prisma.timeEntry.groupBy({
            by: ["storeUuid"],
            where: {
                storeUuid: { in: storeUuids },
                clockOut: null, // currently clocked in
            },
            _count: true,
        });
    
        const revenueMap = new Map(
            revenueByStore.map((r) => [r.storeUuid, { sum: r._sum.amount ?? 0, count: r._count }])
        );
        const activeMap = new Map(activeByStore.map((a) => [a.storeUuid, a._count]));
        const staffMap = new Map(staffByStore.map((s) => [s.storeUuid, s._count]));
    
        return stores
            .map((store) => ({
                storeUuid: store.uuid,
                storeName: store.name,
                revenue: revenueMap.get(store.uuid)?.sum ?? 0,
                orderCount: revenueMap.get(store.uuid)?.count ?? 0,
                staffOnShift: staffMap.get(store.uuid) ?? 0,
                activeOrders: activeMap.get(store.uuid) ?? 0,
            }))
            .sort((a, b) => b.revenue - a.revenue); // Best performing first
    }
 
    //Top selling item
    private static async getTopProducts(
        tenantUuid: string,
        since: Date,
        limit: number
    ): Promise<TopProduct[]> {
        const topItems = await prisma.orderItem.groupBy({
            by: ["menuItemUuid"],
            where: {
                order: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
            },
            _sum: { quantity: true, subtotal: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: limit,
        });
    
        // Hydrate item names
        const itemUuids = topItems.map((i) => i.menuItemUuid);
        const items = await prisma.menuItem.findMany({
            where: { uuid: { in: itemUuids } },
            select: { uuid: true, name: true },
        });
        const nameMap = new Map(items.map((i) => [i.uuid, i.name]));
    
        return topItems.map((i) => ({
            menuItemUuid: i.menuItemUuid,
            name: nameMap.get(i.menuItemUuid) ?? "Unknown Item",
            quantity: i._sum.quantity ?? 0,
            revenue: i._sum.subtotal ?? 0,
        }));
    }
 
    //Staff overview
    private static async getStaffSummary(tenantUuid: string) {
        const [totalStaff, clockedIn, onBreak] = await Promise.all([
            prisma.tenantUser.count({
                where: { tenantUuid, active: true, role: { not: "CUSTOMER" } },
            }),
        
            prisma.timeEntry.count({
                where: {
                    tenantUser: { tenantUuid },
                    clockOut: null,
                },
            }),
    
            prisma.breakEntry.count({
                where: {
                    timeEntry: { tenantUser: { tenantUuid }, clockOut: null },
                    endTime: null, // currently on break
                },
            }),
        ]);
    
        return {
            total: totalStaff,
            clockedIn,
            onBreak,
            available: clockedIn - onBreak,
        };
    }
 
    //Recent order feed
    private static async getRecentOrders(tenantUuid: string, limit: number) {
        return prisma.order.findMany({
            where: { tenantUuid },
            select: {
                uuid: true,
                orderNumber: true,
                status: true,
                totalAmount: true,
                createdAt: true,
                store: { select: { name: true } },
                customer: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }
 
    //Cache invalidation (called from event handlers)
    static async invalidate(tenantUuid: string) {
        await invalidateCacheVersion(`tenant:${tenantUuid}:dashboard`);
        logWithContext("info", "[TenantDashboard] Cache invalidated", { tenantUuid });
    }
}