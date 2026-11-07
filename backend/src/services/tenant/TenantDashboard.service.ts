import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import prisma from "../../config/prisma.ts"
import { bumpCacheVersion, getCacheVersion } from "../../infrastructure/cache/cacheVersion.ts";
import { withCache } from "../../infrastructure/cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import {
    collectedRevenue,
    collectedRevenueByStore,
    failedPaymentsIn,
    fixedWindows,
    ordersCreatedIn,
    periodWindows,
    revenueByChannel,
    revenueByLocalDay,
    type Period,
    type StoreWindow,
} from "../Dashboards/storeRevenue.ts";

dayjs.extend(utc);

type TimeRange = Period;
 
interface DateFilter {
    dateFrom?: Date;
    dateTo?: Date;
}

// Revenue is the daily reconciliation's: money collected (PAID / COMPLETED /
// PARTIALLY_REFUNDED / REFUNDED payments, when it came in) minus refunds paid
// back minus provider fees, over each store's own local period. `revenue`
// fields are that net figure.
interface RevenueBreakdown {
    total: number;          // net
    gross: number;
    refunds: number;
    providerFees: number;
    cash: number;           // per channel: collected - refunded
    card: number;
    online: number;
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

// The current UTC hour ("2026-10-18T14"), for cache keys of ranges that end
// "now": entries are shared within the hour, and a store's new local day
// (which starts on an hour) starts a new key
const hourBucket = (now: Date = new Date()) => now.toISOString().slice(0, 13);

const dateKey = (d: Date) => (Number.isNaN(d.getTime()) ? "invalid" : d.toISOString());

// Every store of the tenant, open or not: a closed store's sales are still
// the tenant's revenue
const tenantStores = (tenantUuid: string) =>
    prisma.store.findMany({ where: { tenantUuid }, select: { uuid: true, timezone: true } });

// A dashboard range: the caller's dateFrom / dateTo (the same instants for
// every store), or else today so far in each store's own timezone. `previous`
// is the stretch just before it, for "change since".
function resolveRange(filters?: DateFilter) {
    const from = filters?.dateFrom;
    const to = filters?.dateTo;
    return {
        key: `${from ? dateKey(from) : "today"}:${to ? dateKey(to) : "now"}${from && to ? "" : `:${hourBucket()}`}`,
        windows(stores: { uuid: string; timezone: string | null }[], now: Date = new Date()) {
            const until = to ?? now;
            if (from) {
                const span = until.getTime() - from.getTime();
                return {
                    current: fixedWindows(stores, from, until),
                    previous: fixedWindows(stores, new Date(from.getTime() - span), from),
                };
            }
            const today = periodWindows(stores, "today", now);
            return {
                current: today.current.map((w) => ({ ...w, lt: until })),
                previous: today.previous,
            };
        },
    };
}

// The span covered by a set of store windows, for tenant-wide filters that
// have no store (customers joining)
function overallSpan(windows: StoreWindow[]) {
    if (windows.length === 0) return { gte: new Date(), lt: new Date() };
    return {
        gte: new Date(Math.min(...windows.map((w) => w.gte.getTime()))),
        lt: new Date(Math.max(...windows.map((w) => w.lt.getTime()))),
    };
}
 
export class TenantDashboardService {
    //Main dashboard: revenue, orders, stores, staff, top products
    static async getDashboard(tenantUuid: string, timeRange: TimeRange = "today") {
        const version = await getCacheVersion(`tenant:${tenantUuid}:dashboard`);
        const cacheKey = `tenant:${tenantUuid}:dashboard:${timeRange}:${hourBucket()}:v${version}`;
        const ttl = getCacheTTL(timeRange);

        return withCache(cacheKey, ttl, async () => {
            const timer = MetricsService.startTimer("dashboard_build", { role: "tenant_admin" });
            try {
                const stores = await tenantStores(tenantUuid);
                const { current, previous } = periodWindows(stores, timeRange);

                const [
                    overview,
                    previousRevenue,
                    revenueBreakdown,
                    storeSnapshots,
                    topProducts,
                    staffSummary,
                    recentOrders,
                ] = await Promise.all([
                    TenantDashboardService.buildOverview(tenantUuid, current),
                    collectedRevenue(previous),
                    TenantDashboardService.buildRevenueBreakdown(current),
                    TenantDashboardService.buildStoreSnapshots(tenantUuid, current),
                    TenantDashboardService.buildTopProducts(tenantUuid, current, 10),
                    TenantDashboardService.buildStaffSummary(tenantUuid),
                    TenantDashboardService.buildRecentOrders(tenantUuid, 20),
                ]);

                return {
                    timeRange,
                    overview: {
                        ...overview,
                        revenueChange: percentChange(overview.revenue, previousRevenue.net),
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
        const range = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:overview`);
        const cacheKey = `tenant:${tenantUuid}:overview:${range.key}:v${version}`;

        return withCache(cacheKey, 60, async () => {
            const { current, previous } = range.windows(await tenantStores(tenantUuid));

            const [overview, previousRevenue] = await Promise.all([
                TenantDashboardService.buildOverview(tenantUuid, current),
                collectedRevenue(previous),
            ]);

            const span = overallSpan(current);
            return {
                ...overview,
                revenueChange: percentChange(overview.revenue, previousRevenue.net),
                period: { from: span.gte.toISOString(), to: span.lt.toISOString() },
                generatedAt: new Date().toISOString(),
            };
        });
    }

    // GET /stores/performance
    static async getStorePerformance(tenantUuid: string, filters?: DateFilter) {
        const range = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:stores`);
        const cacheKey = `tenant:${tenantUuid}:stores:${range.key}:v${version}`;

        return withCache(cacheKey, 120, async () => {
            const { current } = range.windows(await tenantStores(tenantUuid));
            return TenantDashboardService.buildStoreSnapshots(tenantUuid, current);
        });
    }

    // GET /products/top
    static async getTopProducts(
        tenantUuid: string,
        filters?: DateFilter & { limit?: number }
    ) {
        const range = resolveRange(filters);
        const limit = filters?.limit ?? 10;

        const version = await getCacheVersion(`tenant:${tenantUuid}:products`);
        const cacheKey = `tenant:${tenantUuid}:products:${range.key}:${limit}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            const { current } = range.windows(await tenantStores(tenantUuid));
            return TenantDashboardService.buildTopProducts(tenantUuid, current, limit);
        });
    }

    // GET /revenue/trend
    // Buckets are store-local calendar days (weeks start on Sunday)
    static async getRevenueTrend(
        tenantUuid: string,
        filters?: DateFilter & { groupBy?: "day" | "week" | "month" }
    ) {
        const range = resolveRange(filters);
        const groupBy = filters?.groupBy ?? "day";

        const version = await getCacheVersion(`tenant:${tenantUuid}:revenue`);
        const cacheKey = `tenant:${tenantUuid}:revenue:${range.key}:${groupBy}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            const { current } = range.windows(await tenantStores(tenantUuid));
            const days = await revenueByLocalDay(current);

            const buckets = new Map<string, { revenue: number; gross: number; refunds: number; providerFees: number; count: number }>();
            for (const [day, r] of days) {
                const key =
                    groupBy === "week" ? dayjs.utc(day).startOf("week").format("YYYY-MM-DD")
                    : groupBy === "month" ? day.slice(0, 7)
                    : day;
                const b = buckets.get(key) ?? { revenue: 0, gross: 0, refunds: 0, providerFees: 0, count: 0 };
                b.revenue += r.net;
                b.gross += r.gross;
                b.refunds += r.refunds;
                b.providerFees += r.providerFees;
                b.count += r.payments;
                buckets.set(key, b);
            }

            const trend = Array.from(buckets.entries())
                .map(([period, data]) => ({
                    period,
                    revenue: data.revenue,
                    gross: data.gross,
                    refunds: data.refunds,
                    providerFees: data.providerFees,
                    orderCount: data.count,
                    averageOrderValue: data.count > 0
                        ? Math.round((data.gross / data.count) * 100) / 100
                        : 0,
                }))
                .sort((a, b) => a.period.localeCompare(b.period));

            const span = overallSpan(current);
            return {
                groupBy,
                period: { from: span.gte.toISOString(), to: span.lt.toISOString() },
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
        const range = resolveRange(filters);

        const version = await getCacheVersion(`tenant:${tenantUuid}:customers`);
        const cacheKey = `tenant:${tenantUuid}:customers:${range.key}:v${version}`;

        return withCache(cacheKey, 300, async () => {
            const { current } = range.windows(await tenantStores(tenantUuid));
            const span = overallSpan(current);
            const completedInRange = { tenantUuid, status: "COMPLETED" as const, ...ordersCreatedIn(current) };

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
                        createdAt: span,
                    },
                }),

                // Customers who placed an order in period
                prisma.order.groupBy({
                    by: ["tenantUserUuid"],
                    where: completedInRange,
                }).then((groups) => groups.length),

                // Top spenders
                prisma.order.groupBy({
                    by: ["tenantUserUuid"],
                    where: completedInRange,
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
                period: { from: span.gte.toISOString(), to: span.lt.toISOString() },
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
            // Price and interval live on the subscribed PlanPrice, not on Plan
            include: { plan: true, planPrice: true },
            orderBy: { createdAt: "desc" },
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
                price: subscription.planPrice.amount,
                currency: subscription.planPrice.currency,
                billingInterval: subscription.planPrice.interval,
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

    // Core overview metrics over the stores' windows
    private static async buildOverview(tenantUuid: string, windows: StoreWindow[]) {
        const [revenue, orderStats, activeOrders, failedPayments, totalStores] =
            await Promise.all([
                collectedRevenue(windows),

                prisma.order.aggregate({
                    where: { tenantUuid, status: "COMPLETED", ...ordersCreatedIn(windows) },
                    _count: true,
                    _avg: { totalAmount: true },
                }),

                prisma.order.count({
                    where: {
                        tenantUuid,
                        status: { in: ["PENDING", "PREPARING", "READY"] },
                    },
                }),

                prisma.payment.count({ where: { tenantUuid, ...failedPaymentsIn(windows) } }),

                prisma.store.count({ where: { tenantUuid, active: true } }),
            ]);

        return {
            revenue: revenue.net,
            revenueDetail: revenue,
            completedOrders: orderStats._count,
            averageOrderValue: Math.round((orderStats._avg.totalAmount ?? 0) * 100) / 100,
            activeOrders,
            failedPayments,
            totalStores,
        };
    }

    // Revenue by reconciliation channel
    private static async buildRevenueBreakdown(windows: StoreWindow[]): Promise<RevenueBreakdown> {
        const [revenue, channels] = await Promise.all([
            collectedRevenue(windows),
            revenueByChannel(windows),
        ]);
        const kept = (c: { gross: number; refunds: number }) => c.gross - c.refunds;

        return {
            total: revenue.net,
            gross: revenue.gross,
            refunds: revenue.refunds,
            providerFees: revenue.providerFees,
            cash: kept(channels.CASH),
            card: kept(channels.CARD_TERMINAL),
            online: kept(channels.ONLINE),
            averageOrderValue: revenue.payments > 0 ? Math.round((revenue.gross / revenue.payments) * 100) / 100 : 0,
        };
    }

    // Per-store performance
    private static async buildStoreSnapshots(
        tenantUuid: string,
        windows: StoreWindow[]
    ): Promise<StoreSnapshot[]> {
        const stores = await prisma.store.findMany({
            where: { tenantUuid, active: true },
            select: { uuid: true, name: true },
        });

        const storeUuids = stores.map((s) => s.uuid);
        const activeWindows = windows.filter((w) => storeUuids.includes(w.storeUuid));

        const [revenueByStore, activeByStore, staffByStore] = await Promise.all([
            collectedRevenueByStore(activeWindows),

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

        const activeMap = new Map(activeByStore.map((a) => [a.storeUuid, a._count]));
        const staffMap = new Map(staffByStore.map((s) => [s.storeUuid, s._count]));

        return stores
            .map((store) => ({
                storeUuid: store.uuid,
                storeName: store.name,
                revenue: revenueByStore.get(store.uuid)?.net ?? 0,
                orderCount: revenueByStore.get(store.uuid)?.payments ?? 0,
                staffOnShift: staffMap.get(store.uuid) ?? 0,
                activeOrders: activeMap.get(store.uuid) ?? 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);
    }

    // Top products by quantity sold
    private static async buildTopProducts(
        tenantUuid: string,
        windows: StoreWindow[],
        limit: number
    ): Promise<TopProduct[]> {
        const topItems = await prisma.orderItem.groupBy({
            by: ["productUuid"],
            where: {
                order: { tenantUuid, status: "COMPLETED", ...ordersCreatedIn(windows) },
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