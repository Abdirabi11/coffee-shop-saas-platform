import dayjs from "dayjs";
import prisma from "../../lib/prisma.ts";
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import { withCache } from "../../cache/cache.ts";


type Granularity = "hour" | "day" | "week" | "month";
 
interface AnalyticsFilters {
    tenantUuid: string;
    storeUuid?: string;
    from: Date;
    to: Date;
    granularity?: Granularity;
}
 
function inferGranularity(from: Date, to: Date): Granularity {
    const days = dayjs(to).diff(dayjs(from), "day");
    if (days <= 1) return "hour";
    if (days <= 14) return "day";
    if (days <= 90) return "week";
    return "month";
}
 
function buildDateTrunc(granularity: Granularity): string {
    switch (granularity) {
        case "hour":
            return "date_trunc('hour', p.\"createdAt\")";
        case "day":
            return "date_trunc('day', p.\"createdAt\")";
        case "week":
            return "date_trunc('week', p.\"createdAt\")";
        case "month":
            return "date_trunc('month', p.\"createdAt\")";
    }
}
 
export class TenantAnalyticsService {
    //Revenue trend — aggregated at DB level with configurable granularity
    static async getRevenueTrend(filters: AnalyticsFilters) {
        const { tenantUuid, storeUuid, from, to } = filters;
        const granularity = filters.granularity ?? inferGranularity(from, to);
    
        const version = await getCacheVersion(`tenant:${tenantUuid}:analytics`);
        const cacheKey = `analytics:revenue:${tenantUuid}:${storeUuid ?? "all"}:${granularity}:${from.toISOString()}:${to.toISOString()}:v${version}`;
    
        return withCache(cacheKey, 600, async () => {
            const dateTrunc = buildDateTrunc(granularity);
            const storeFilter = storeUuid
                ? `AND p."storeUuid" = '${storeUuid}'`
                : "";
        
            const result = await prisma.$queryRawUnsafe<
                { period: Date; revenue: number; order_count: number; avg_order: number }[]
            >(
                `SELECT 
                ${dateTrunc} as period,
                COALESCE(SUM(p.amount), 0)::float as revenue,
                COUNT(*)::int as order_count,
                COALESCE(AVG(p.amount), 0)::float as avg_order
                FROM "Payment" p
                WHERE p."tenantUuid" = $1
                AND p.status = 'SUCCESS'
                AND p."createdAt" >= $2
                AND p."createdAt" <= $3
                ${storeFilter}
                GROUP BY period
                ORDER BY period ASC`,
                tenantUuid,
                from,
                to
            );
        
            return {
                granularity,
                from: from.toISOString(),
                to: to.toISOString(),
                dataPoints: result.map((r) => ({
                    period: r.period,
                    label: formatPeriodLabel(r.period, granularity),
                    revenue: Math.round(r.revenue * 100) / 100,
                    orderCount: r.order_count,
                    averageOrder: Math.round(r.avg_order * 100) / 100,
                })),
                summary: {
                    totalRevenue: result.reduce((sum, r) => sum + r.revenue, 0),
                    totalOrders: result.reduce((sum, r) => sum + r.order_count, 0),
                },
            };
        });
    }
 
    //Payment method breakdown over time
    static async getPaymentMethodBreakdown(filters: AnalyticsFilters) {
        const { tenantUuid, storeUuid, from, to } = filters;
        const cacheKey = `analytics:payment-methods:${tenantUuid}:${storeUuid ?? "all"}:${from.toISOString()}:${to.toISOString()}`;
    
        return withCache(cacheKey, 600, async () => {
            const storeWhere = storeUuid ? { storeUuid } : {};
        
            const grouped = await prisma.payment.groupBy({
                by: ["paymentMethod"],
                where: {
                    tenantUuid,
                    status: "SUCCESS",
                    createdAt: { gte: from, lte: to },
                    ...storeWhere,
                },
                _sum: { amount: true },
                _count: true,
            });
    
            const total = grouped.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
    
            return grouped
                .map((g) => ({
                    method: g.paymentMethod,
                    revenue: g._sum.amount ?? 0,
                    count: g._count,
                    percentage: total > 0
                        ? Math.round(((g._sum.amount ?? 0) / total) * 100 * 100) / 100
                        : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);
        });
    }
 
    //Peak hours analysis — which hours drive the most orders and revenue
    static async getPeakHoursAnalysis(
        tenantUuid: string,
        storeUuid?: string,
        days: number = 30
    ) {
        const since = dayjs().subtract(days, "day").toDate();
        const cacheKey = `analytics:peak-hours:${tenantUuid}:${storeUuid ?? "all"}:${days}d`;
 
        return withCache(cacheKey, 1800, async () => {
            const storeFilter = storeUuid
                ? `AND o."storeUuid" = '${storeUuid}'`
                : "";
        
            const result = await prisma.$queryRawUnsafe<
                { hour: number; order_count: number; revenue: number; avg_order: number }[]
            >(
                `SELECT 
                EXTRACT(HOUR FROM o."createdAt")::int as hour,
                COUNT(*)::int as order_count,
                COALESCE(SUM(o."totalAmount"), 0)::float as revenue,
                COALESCE(AVG(o."totalAmount"), 0)::float as avg_order
                FROM "Order" o
                WHERE o."tenantUuid" = $1
                AND o.status = 'COMPLETED'
                AND o."createdAt" >= $2
                ${storeFilter}
                GROUP BY hour
                ORDER BY hour ASC`,
                tenantUuid,
                since
            );
    
            // Find peak
            const peak = result.reduce(
                (max, r) => (r.order_count > max.order_count ? r : max),
                { hour: 0, order_count: 0, revenue: 0, avg_order: 0 }
            );
        
            return {
                period: `last ${days} days`,
                hours: result.map((r) => ({
                    hour: r.hour,
                    label: `${String(r.hour).padStart(2, "0")}:00`,
                    orderCount: r.order_count,
                    revenue: Math.round(r.revenue * 100) / 100,
                    averageOrder: Math.round(r.avg_order * 100) / 100,
                })),
                peakHour: {
                    hour: peak.hour,
                    label: `${String(peak.hour).padStart(2, "0")}:00`,
                    orderCount: peak.order_count,
                },
            };
        });
    }
 
    //Day-of-week analysis — busiest days
    static async getDayOfWeekAnalysis(
        tenantUuid: string,
        storeUuid?: string,
        days: number = 90
    ) {
        const since = dayjs().subtract(days, "day").toDate();
        const cacheKey = `analytics:dow:${tenantUuid}:${storeUuid ?? "all"}:${days}d`;
    
        return withCache(cacheKey, 3600, async () => {
            const storeFilter = storeUuid
                ? `AND o."storeUuid" = '${storeUuid}'`
                : "";
        
            const result = await prisma.$queryRawUnsafe<
                { dow: number; order_count: number; revenue: number }[]
            >(
                `SELECT 
                EXTRACT(DOW FROM o."createdAt")::int as dow,
                COUNT(*)::int as order_count,
                COALESCE(SUM(o."totalAmount"), 0)::float as revenue
                FROM "Order" o
                WHERE o."tenantUuid" = $1
                AND o.status = 'COMPLETED'
                AND o."createdAt" >= $2
                ${storeFilter}
                GROUP BY dow
                ORDER BY dow ASC`,
                tenantUuid,
                since
            );
        
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        
            return result.map((r) => ({
                day: dayNames[r.dow],
                dayIndex: r.dow,
                orderCount: r.order_count,
                revenue: Math.round(r.revenue * 100) / 100,
            }));
        });
    }
 
    //Store comparison — side-by-side metrics for all stores
    static async getStoreComparison(tenantUuid: string, days: number = 30) {
        const since = dayjs().subtract(days, "day").toDate();
        const cacheKey = `analytics:store-compare:${tenantUuid}:${days}d`;
    
        return withCache(cacheKey, 600, async () => {
            const stores = await prisma.store.findMany({
                where: { tenantUuid, isActive: true },
                select: { uuid: true, name: true },
            });
    
            const storeUuids = stores.map((s) => s.uuid);
    
            const [revenueByStore, ordersByStore, ratingsByStore] = await Promise.all([
                prisma.payment.groupBy({
                    by: ["storeUuid"],
                    where: {
                        tenantUuid,
                        storeUuid: { in: storeUuids },
                        status: "SUCCESS",
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
                        status: "COMPLETED",
                        createdAt: { gte: since },
                    },
                    _count: true,
                    _avg: { totalAmount: true },
                }),
        
                // Average customer rating per store (if you have reviews)
                prisma.review.groupBy({
                    by: ["storeUuid"],
                    where: {
                        storeUuid: { in: storeUuids },
                        createdAt: { gte: since },
                    },
                    _avg: { rating: true },
                    _count: true,
                }),
            ]);
    
            const revenueMap = new Map(
                revenueByStore.map((r) => [r.storeUuid, { amount: r._sum.amount ?? 0, txCount: r._count }])
            );
            const ordersMap = new Map(
                ordersByStore.map((o) => [o.storeUuid, { count: o._count, avgOrder: o._avg.totalAmount ?? 0 }])
            );
            const ratingsMap = new Map(
                ratingsByStore.map((r) => [r.storeUuid, { avg: r._avg.rating ?? 0, count: r._count }])
            );
    
            return stores
                .map((store) => ({
                storeUuid: store.uuid,
                storeName: store.name,
                revenue: revenueMap.get(store.uuid)?.amount ?? 0,
                transactions: revenueMap.get(store.uuid)?.txCount ?? 0,
                orders: ordersMap.get(store.uuid)?.count ?? 0,
                averageOrder: Math.round((ordersMap.get(store.uuid)?.avgOrder ?? 0) * 100) / 100,
                rating: Math.round((ratingsMap.get(store.uuid)?.avg ?? 0) * 10) / 10,
                reviewCount: ratingsMap.get(store.uuid)?.count ?? 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);
        });
    }
 
    //Customer analytics — new vs returning, top customers
    static async getCustomerAnalytics(tenantUuid: string, days: number = 30) {
        const since = dayjs().subtract(days, "day").toDate();
        const cacheKey = `analytics:customers:${tenantUuid}:${days}d`;
    
        return withCache(cacheKey, 600, async () => {
            const [
                totalCustomers,
                newCustomers,
                topCustomers,
                repeatRate,
            ] = await Promise.all([
                // Total unique customers who ordered
                prisma.order.findMany({
                    where: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
                    select: { customerUuid: true },
                    distinct: ["customerUuid"],
                }),
        
                // New customers (first order in this period)
                prisma.$queryRawUnsafe<{ count: number }[]>(
                    `SELECT COUNT(DISTINCT o."customerUuid")::int as count
                    FROM "Order" o
                    WHERE o."tenantUuid" = $1
                        AND o.status = 'COMPLETED'
                        AND o."createdAt" >= $2
                        AND NOT EXISTS (
                        SELECT 1 FROM "Order" prev
                        WHERE prev."customerUuid" = o."customerUuid"
                            AND prev."tenantUuid" = $1
                            AND prev."createdAt" < $2
                            AND prev.status = 'COMPLETED'
                        )`,
                    tenantUuid,
                    since
                ),
        
                // Top 10 customers by spend
                prisma.order.groupBy({
                    by: ["customerUuid"],
                    where: { tenantUuid, status: "COMPLETED", createdAt: { gte: since } },
                    _sum: { totalAmount: true },
                    _count: true,
                    orderBy: { _sum: { totalAmount: "desc" } },
                    take: 10,
                }),
        
                // Repeat order rate
                prisma.$queryRawUnsafe<{ repeaters: number }[]>(
                    `SELECT COUNT(*)::int as repeaters FROM (
                        SELECT o."customerUuid"
                        FROM "Order" o
                        WHERE o."tenantUuid" = $1
                        AND o.status = 'COMPLETED'
                        AND o."createdAt" >= $2
                        GROUP BY o."customerUuid"
                        HAVING COUNT(*) > 1
                    ) sub`,
                    tenantUuid,
                    since
                ),
            ]);
    
            const uniqueCount = totalCustomers.length;
            const newCount = newCustomers[0]?.count ?? 0;
            const repeatCount = repeatRate[0]?.repeaters ?? 0;
        
            // Hydrate top customer names
            const customerUuids = topCustomers.map((c) => c.customerUuid);
            const customers = await prisma.user.findMany({
                where: { uuid: { in: customerUuids } },
                select: { uuid: true, name: true },
            });
            const nameMap = new Map(customers.map((c) => [c.uuid, c.name]));
        
            return {
                period: `last ${days} days`,
                uniqueCustomers: uniqueCount,
                newCustomers: newCount,
                returningCustomers: uniqueCount - newCount,
                repeatRate: uniqueCount > 0
                ? Math.round((repeatCount / uniqueCount) * 100 * 100) / 100
                : 0,
                topCustomers: topCustomers.map((c) => ({
                    customerUuid: c.customerUuid,
                    name: nameMap.get(c.customerUuid) ?? "Guest",
                    totalSpent: c._sum.totalAmount ?? 0,
                    orderCount: c._count,
                })),
            };
        });
    }
}
 
function formatPeriodLabel(date: Date, granularity: Granularity): string {
    const d = dayjs(date);
    switch (granularity) {
        case "hour":
            return d.format("HH:mm");
        case "day":
            return d.format("MMM DD");
        case "week":
            return `Week of ${d.format("MMM DD")}`;
        case "month":
            return d.format("YYYY-MM");
    }
}