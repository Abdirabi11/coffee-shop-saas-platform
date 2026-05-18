import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { bumpCacheVersion, getCacheVersion } from "../../cache/cacheVersion.ts";
import { withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

type TimeRange = "today" | "week" | "month" | "quarter" | "year";
 
interface DateFilter {
    dateFrom?: Date;
    dateTo?: Date;
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
    productUuid: string;
    name: string;
    quantity: number;
    revenue: number;
}
 
function getTimeRangeStart(range: TimeRange): Date {
    const now = dayjs();
    switch (range) {
        case "today":   return now.startOf("day").toDate();
        case "week":    return now.startOf("week").toDate();
        case "month":   return now.startOf("month").toDate();
        case "quarter": return now.subtract(3, "month").startOf("month").toDate();
        case "year":    return now.startOf("year").toDate();
    }
}

function getCacheTTL(range: TimeRange): number {
    switch (range) {
        case "today":   return 60;
        case "week":    return 300;
        case "month":   return 600;
        case "quarter":
        case "year":    return 1800;
    }
}

function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

function resolveRange(filters?: DateFilter) {
    const since = filters?.dateFrom ?? dayjs().startOf("day").toDate();
    const until = filters?.dateTo ?? new Date();
    return { since, until };
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
                    TenantDashboardService.getRevenueAmount(tenantUuid, previousRangeStart, rangeStart),
                    TenantDashboardService.buildRevenueBreakdown(tenantUuid, rangeStart),
                    TenantDashboardService.buildStoreSnapshots(tenantUuid, rangeStart),
                    TenantDashboardService.buildTopProducts(tenantUuid, rangeStart, 10),
                    TenantDashboardService.buildStaffSummary(tenantUuid),
                    TenantDashboardService.buildRecentOrders(tenantUuid, 20),
                ]);

                return {
                    timeRange,
                    overview: {
                        ...overview,
                        revenueChange: percentChange(overview.revenue, previousRevenue),
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

    // GET /overview
    static async getOverview(tenantUuid: string, filters?: DateFilter) {
        const { since, until } = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:overview`);
        const cacheKey = `tenant:${tenantUuid}:overview:${since.getTime()}:${until.getTime()}:v${version}`;

        return withCache(cacheKey, 60, async () => {
            const previousDuration = dayjs(until).diff(dayjs(since), "millisecond");
            const previousStart = dayjs(since).subtract(previousDuration, "millisecond").toDate();

            const [current, previousRevenue] = await Promise.all([
                TenantDashboardService.buildOverview(tenantUuid, since),
                TenantDashboardService.getRevenueAmount(tenantUuid, previousStart, since),
            ]);

            return {
                ...current,
                revenueChange: percentChange(current.revenue, previousRevenue),
                period: { from: since.toISOString(), to: until.toISOString() },
                generatedAt: new Date().toISOString(),
            };
        });
    }

    // GET /stores/performance
    static async getStorePerformance(tenantUuid: string, filters?: DateFilter) {
        const { since } = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:stores`);
        const cacheKey = `tenant:${tenantUuid}:stores:${since.getTime()}:v${version}`;

        return withCache(cacheKey, 120, async () => {
            return TenantDashboardService.buildStoreSnapshots(tenantUuid, since);
        });
    }

    // GET /products/top
    static async getTopProducts(
        tenantUuid: string,
        filters?: DateFilter & { limit?: number }
    ) {
        const { since } = resolveRange(filters);
        const limit = filters?.limit ?? 10;

        const version = await getCacheVersion(`tenant:${tenantUuid}:products`);
        const cacheKey = `tenant:${tenantUuid}:products:${since.getTime()}:${limit}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            return TenantDashboardService.buildTopProducts(tenantUuid, since, limit);
        });
    }

    // GET /revenue/trend
    static async getRevenueTrend(
        tenantUuid: string,
        filters?: DateFilter & { groupBy?: "day" | "week" | "month" }
    ) {
        const { since, until } = resolveRange(filters);
        const groupBy = filters?.groupBy ?? "day";

        const version = await getCacheVersion(`tenant:${tenantUuid}:revenue`);
        const cacheKey = `tenant:${tenantUuid}:revenue:${since.getTime()}:${until.getTime()}:${groupBy}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            const payments = await prisma.payment.findMany({
                where: {
                    tenantUuid,
                    status: "COMPLETED",
                    processedAt: { gte: since, lte: until },
                },
                select: { amount: true, processedAt: true },
                orderBy: { processedAt: "asc" },
            });

            // Group by time bucket
            const buckets = new Map<string, { revenue: number; count: number }>();

            for (const p of payments) {
                if (!p.processedAt) continue;
                const date = dayjs(p.processedAt);
                let key: string;

                switch (groupBy) {
                    case "week":
                        key = date.startOf("week").format("YYYY-MM-DD");
                        break;
                    case "month":
                        key = date.format("YYYY-MM");
                        break;
                    default:
                        key = date.format("YYYY-MM-DD");
                }

                const existing = buckets.get(key) ?? { revenue: 0, count: 0 };
                existing.revenue += p.amount;
                existing.count += 1;
                buckets.set(key, existing);
            }

            const trend = Array.from(buckets.entries())
                .map(([period, data]) => ({
                    period,
                    revenue: data.revenue,
                    orderCount: data.count,
                    averageOrderValue: data.count > 0
                        ? Math.round((data.revenue / data.count) * 100) / 100
                        : 0,
                }))
                .sort((a, b) => a.period.localeCompare(b.period));

            return {
                groupBy,
                period: { from: since.toISOString(), to: until.toISOString() },
                data: trend,
                totals: {
                    revenue: trend.reduce((sum, t) => sum + t.revenue, 0),
                    orders: trend.reduce((sum, t) => sum + t.orderCount, 0),
                },
            };
        });
    }

    // GET /customers
    static async getCustomerInsights(tenantUuid: string, filters?: DateFilter) {
        const { since, until } = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:customers`);
        const cacheKey = `tenant:${tenantUuid}:customers:${since.getTime()}:${until.getTime()}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            const [totalCustomers, newCustomers, activeCustomers, topSpenders] = await Promise.all([
                // Total customers (users with CUSTOMER globalRole who have a TenantUser)
                prisma.tenantUser.count({
                    where: {
                        tenantUuid,
                        isActive: true,
                        user: { globalRole: "CUSTOMER" },
                    },
                }),

                // New customers in period
                prisma.tenantUser.count({
                    where: {
                        tenantUuid,
                        isActive: true,
                        user: { globalRole: "CUSTOMER" },
                        createdAt: { gte: since, lte: until },
                    },
                }),

                // Customers who placed an order in period
                prisma.order.groupBy({
                    by: ["tenantUserUuid"],
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: { gte: since, lte: until },
                    },
                }).then((groups) => groups.length),

                // Top spenders
                prisma.order.groupBy({
                    by: ["tenantUserUuid"],
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: { gte: since, lte: until },
                    },
                    _sum: { totalAmount: true },
                    _count: true,
                    orderBy: { _sum: { totalAmount: "desc" } },
                    take: 10,
                }),
            ]);

            // Hydrate top spender names
            const spenderUuids = topSpenders.map((s) => s.tenantUserUuid).filter(Boolean) as string[];
            const spenderUsers = await prisma.tenantUser.findMany({
                where: { uuid: { in: spenderUuids } },
                select: { uuid: true, displayName: true },
            });
            const nameMap = new Map(spenderUsers.map((u) => [u.uuid, u.displayName]));

            return {
                total: totalCustomers,
                newInPeriod: newCustomers,
                activeInPeriod: activeCustomers,
                period: { from: since.toISOString(), to: until.toISOString() },
                topSpenders: topSpenders.map((s) => ({
                    tenantUserUuid: s.tenantUserUuid,
                    name: nameMap.get(s.tenantUserUuid!) ?? "Unknown",
                    totalSpent: s._sum.totalAmount ?? 0,
                    orderCount: s._count,
                })),
            };
        });
    }

    // GET /subscription
    static async getSubscriptionInfo(tenantUuid: string) {
        const subscription = await prisma.subscription.findFirst({
            where: { tenantUuid },
            include: { plan: true },
        });

        if (!subscription) return null;

        const tenant = await prisma.tenant.findUnique({
            where: { uuid: tenantUuid },
            select: {
                maxStores: true,
                maxUsers: true,
                maxOrders: true,
                _count: {
                    select: {
                        stores: { where: { active: true } },
                        users: { where: { isActive: true } },
                    },
                },
            },
        });

        return {
            plan: {
                name: subscription.plan.name,
                tier: subscription.plan.tier,
                price: subscription.plan.price,
                billingInterval: subscription.plan.billingInterval,
            },
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            usage: {
                stores: { used: tenant?._count.stores ?? 0, limit: tenant?.maxStores ?? 0 },
                users: { used: tenant?._count.users ?? 0, limit: tenant?.maxUsers ?? 0 },
            },
        };
    }

    // Core overview metrics
    private static async buildOverview(tenantUuid: string, since: Date) {
        const [totalRevenue, orderStats, activeOrders, failedPayments, totalStores] =
            await Promise.all([
                prisma.payment.aggregate({
                    where: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
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
                        status: { in: ["PENDING", "PREPARING", "READY"] },
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

    // Revenue for a date range
    private static async getRevenueAmount(
        tenantUuid: string,
        from: Date,
        to: Date
    ): Promise<number> {
        const result = await prisma.payment.aggregate({
            where: {
                tenantUuid,
                status: "COMPLETED",
                createdAt: { gte: from, lt: to },
            },
            _sum: { amount: true },
        });
        return result._sum.amount ?? 0;
    }

    // Revenue by payment method
    private static async buildRevenueBreakdown(
        tenantUuid: string,
        since: Date
    ): Promise<RevenueBreakdown> {
        const grouped = await prisma.payment.groupBy({
            by: ["paymentMethod"],
            where: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
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
                case "CARD_TERMINAL":
                case "STRIPE":
                case "APPLE_PAY":
                case "GOOGLE_PAY":
                    card += amount;
                    break;
                case "WALLET":
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

    // Per-store performance
    private static async buildStoreSnapshots(
        tenantUuid: string,
        since: Date
    ): Promise<StoreSnapshot[]> {
        const stores = await prisma.store.findMany({
            where: { tenantUuid, active: true },
            select: { uuid: true, name: true },
        });

        const storeUuids = stores.map((s) => s.uuid);

        const [revenueByStore, activeByStore, staffByStore] = await Promise.all([
            prisma.payment.groupBy({
                by: ["storeUuid"],
                where: {
                    tenantUuid,
                    status: "COMPLETED",
                    storeUuid: { in: storeUuids },
                    createdAt: { gte: since },
                },
                _sum: { amount: true },
                _count: true,
            }),

            prisma.order.groupBy({
                by: ["storeUuid"],
                where: {
                    tenantUuid,
                    storeUuid: { in: storeUuids },
                    status: { in: ["PENDING", "PREPARING", "READY"] },
                },
                _count: true,
            }),

            prisma.timeEntry.groupBy({
                by: ["storeUuid"],
                where: {
                    storeUuid: { in: storeUuids },
                    clockOutAt: null,
                },
                _count: true,
            }),
        ]);

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
            .sort((a, b) => b.revenue - a.revenue);
    }

    // Top products by quantity sold
    private static async buildTopProducts(
        tenantUuid: string,
        since: Date,
        limit: number
    ): Promise<TopProduct[]> {
        const topItems = await prisma.orderItem.groupBy({
            by: ["productUuid"],
            where: {
                order: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
            },
            _sum: { quantity: true, subtotal: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: limit,
        });

        const productUuids = topItems.map((i) => i.productUuid);
        const products = await prisma.product.findMany({
            where: { uuid: { in: productUuids } },
            select: { uuid: true, name: true },
        });
        const nameMap = new Map(products.map((p) => [p.uuid, p.name]));

        return topItems.map((i) => ({
            productUuid: i.productUuid,
            name: nameMap.get(i.productUuid) ?? "Unknown Product",
            quantity: i._sum.quantity ?? 0,
            revenue: i._sum.subtotal ?? 0,
        }));
    }

    // Staff summary
    private static async buildStaffSummary(tenantUuid: string) {
        const [totalStaff, clockedIn] = await Promise.all([
            prisma.tenantUser.count({
                where: { tenantUuid, isActive: true },
            }),

            prisma.timeEntry.count({
                where: {
                    tenantUuid,
                    clockOutAt: null,
                },
            }),
        ]);

        return {
            total: totalStaff,
            clockedIn,
            available: clockedIn,
        };
    }

    // Recent orders
    private static async buildRecentOrders(tenantUuid: string, limit: number) {
        return prisma.order.findMany({
            where: { tenantUuid },
            select: {
                uuid: true,
                orderNumber: true,
                status: true,
                totalAmount: true,
                createdAt: true,
                store: { select: { name: true } },
                tenantUser: { select: { displayName: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    // Cache invalidation
    static async invalidate(tenantUuid: string) {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`tenant:${tenantUuid}:overview`),
            bumpCacheVersion(`tenant:${tenantUuid}:stores`),
            bumpCacheVersion(`tenant:${tenantUuid}:products`),
            bumpCacheVersion(`tenant:${tenantUuid}:revenue`),
            bumpCacheVersion(`tenant:${tenantUuid}:customers`),
        ]);
        logWithContext("info", "[TenantDashboard] All caches invalidated", { tenantUuid });
    }
}