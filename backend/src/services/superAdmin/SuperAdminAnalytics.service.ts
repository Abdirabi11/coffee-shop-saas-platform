import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../infrastructure/cache/redis.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
 
 
export class SuperAdminAnalyticsService {
    //LIVE KPIs (replaces the missing computeSuperAdminKPIs)
    //Real-time platform metrics computed on the fly
    static async getKPIs() {
        return withCache("sa:analytics:kpis", 300, async () => {
            const now = new Date();
            const monthStart = dayjs().startOf("month").toDate();
            const prevMonthStart = dayjs().subtract(1, "month").startOf("month").toDate();
            const prevMonthEnd = dayjs().subtract(1, "month").endOf("month").toDate();
        
            const [
                // Current month
                revenueThisMonth,
                ordersThisMonth,
                newTenantsThisMonth,
        
                // Previous month (for comparison)
                revenuePrevMonth,
                ordersPrevMonth,
                newTenantsPrevMonth,
        
                // Active counts
                activeSubs,
                totalTenants,
        
                // MRR
                mrr,
            ] = await Promise.all([
                prisma.payment.aggregate({
                    where: { status: "COMPLETED", createdAt: { gte: monthStart } },
                    _sum: { amount: true },
                    _count: true,
                }),
                prisma.order.count({
                    where: { status: "COMPLETED", createdAt: { gte: monthStart } },
                }),
                prisma.tenant.count({
                    where: { createdAt: { gte: monthStart } },
                }),
        
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
                    },
                    _sum: { amount: true },
                }),
                prisma.order.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
                    },
                }),
                prisma.tenant.count({
                    where: {
                        createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
                    },
                }),
        
                prisma.subscription.count({ where: { status: "ACTIVE" } }),
                prisma.tenant.count({ where: { status: "ACTIVE" } }),
        
                prisma.subscription.aggregate({
                    where: { status: "ACTIVE" },
                    _sum: { currentPeriodAmount: true },
                }),
            ]);
        
            const curRev = revenueThisMonth._sum.amount ?? 0;
            const prevRev = revenuePrevMonth._sum.amount ?? 0;
        
            const arpu =
                activeSubs > 0 ? Math.round(curRev / activeSubs) : 0;
        
            return {
                revenue: {
                    thisMonth: curRev,
                    prevMonth: prevRev,
                    growth: prevRev > 0
                        ? Number((((curRev - prevRev) / prevRev) * 100).toFixed(2))
                        : 0,
                    transactions: revenueThisMonth._count,
                },
                mrr: mrr._sum.currentPeriodAmount ?? 0,
                arpu,
                orders: {
                    thisMonth: ordersThisMonth,
                    prevMonth: ordersPrevMonth,
                    growth: ordersPrevMonth > 0
                        ? Number(
                            (((ordersThisMonth - ordersPrevMonth) / ordersPrevMonth) * 100).toFixed(2)
                        )
                        : 0,
                },
                tenants: {
                    active: totalTenants,
                    newThisMonth: newTenantsThisMonth,
                    newPrevMonth: newTenantsPrevMonth,
                },
                generatedAt: new Date().toISOString(),
            };
        });
    }

    //REVENUE TREND (from MONTHLY_REVENUE snapshots)
    static async getRevenueTrend(months: number = 12) {
        return withCache(`sa:analytics:revenue-trend:${months}`, 600, async () => {
            const snapshots = await prisma.analyticsSnapshot.findMany({
                where: {
                    type: "MONTHLY_REVENUE",
                    status: "COMPLETED",
                    tenantUuid: null, // Platform-level only
                },
                orderBy: { periodStart: "asc" },
                take: months,
                select: {
                    periodStart: true,
                    metrics: true,
                },
            });
    
            return snapshots.map((s) => {
                const metrics = s.metrics as any;
                return {
                    month: dayjs(s.periodStart).format("YYYY-MM"),
                    totalRevenue: metrics.totalRevenue ?? 0,
                    invoiceRevenue: metrics.invoiceRevenue ?? 0,
                    paymentRevenue: metrics.paymentRevenue ?? 0,
                    totalTransactions: metrics.totalTransactions ?? 0,
                    avgTransactionValue: metrics.avgTransactionValue ?? 0,
                    revenueGrowth: metrics.revenueGrowth ?? 0,
                };
            });
        });
    }
 
    //CHURN ANALYTICS (from CHURN snapshots)
    static async getChurnAnalytics() {
        return withCache("sa:analytics:churn", 600, async () => {
            // Latest churn snapshot
            const latest = await prisma.analyticsSnapshot.findFirst({
                where: { type: "CHURN", status: "COMPLETED" },
                orderBy: { createdAt: "desc" },
            });
        
            // Historical churn trend
            const history = await prisma.analyticsSnapshot.findMany({
                where: { type: "CHURN", status: "COMPLETED" },
                orderBy: { periodStart: "asc" },
                take: 12,
                select: { periodStart: true, metrics: true },
            });
    
            return {
                current: (latest?.metrics as any) ?? {
                    churnRate: 0,
                    retentionRate: 100,
                    tenantsAtStart: 0,
                    churnedTenants: 0,
                },
                trend: history.map((h) => ({
                    month: dayjs(h.periodStart).format("YYYY-MM"),
                    ...(h.metrics as any),
                })),
            };
        });
    }
 
    //ARPU & LTV (from ARPU_LTV snapshots)
    static async getArpuLtv() {
        return withCache("sa:analytics:arpu-ltv", 600, async () => {
            const latest = await prisma.analyticsSnapshot.findFirst({
                where: { type: "ARPU_LTV", status: "COMPLETED" },
                orderBy: { createdAt: "desc" },
            });
        
            const history = await prisma.analyticsSnapshot.findMany({
                where: { type: "ARPU_LTV", status: "COMPLETED" },
                orderBy: { periodStart: "asc" },
                take: 12,
                select: { periodStart: true, metrics: true },
            });
        
            return {
                current: (latest?.metrics as any) ?? {
                    arpu: 0,
                    ltv: 0,
                    avgLifetimeMonths: 0,
                    activeTenants: 0,
                },
                trend: history.map((h) => ({
                    month: dayjs(h.periodStart).format("YYYY-MM"),
                    arpu: (h.metrics as any)?.arpu ?? 0,
                    ltv: (h.metrics as any)?.ltv ?? 0,
                })),
            };
        });
    }
 
    //COHORT RETENTION (from COHORT_RETENTION snapshots)
    static async getCohortRetention() {
        return withCache("sa:analytics:cohort-retention", 1800, async () => {
            const snapshots = await prisma.analyticsSnapshot.findMany({
                where: { type: "COHORT_RETENTION", status: "COMPLETED" },
                orderBy: { periodStart: "desc" },
                take: 12,
                select: { periodStart: true, metrics: true },
            });
        
            return snapshots.map((s) => {
                const metrics = s.metrics as any;
                return {
                    cohort: metrics.cohort ?? dayjs(s.periodStart).format("YYYY-MM"),
                    size: metrics.size ?? 0,
                    retention: metrics.retention ?? {},
                };
            });
        });
    }
 
    //TENANT COHORT GROWTH (from TENANT_COHORT_GROWTH snapshots)
    static async getTenantCohortGrowth() {
        return withCache("sa:analytics:tenant-growth", 1800, async () => {
            const snapshots = await prisma.analyticsSnapshot.findMany({
                where: { type: "TENANT_COHORT_GROWTH", status: "COMPLETED" },
                orderBy: { periodStart: "desc" },
                take: 12,
                select: { periodStart: true, metrics: true },
            });
        
            return snapshots.map((s) => {
                const metrics = s.metrics as any;
                return {
                month: metrics.month ?? dayjs(s.periodStart).format("YYYY-MM"),
                newTenants: metrics.newTenants ?? 0,
                activeAfter3Months: metrics.activeAfter3Months ?? 0,
                retentionRate: metrics.retentionRate ?? 0,
                };
            });
        });
    }

    //GENERIC SNAPSHOT QUERY (for custom analytics dashboard)
    // Allows querying any AnalyticsType with pagination
    static async getSnapshots(input: {
        type: string;
        limit?: number;
        tenantUuid?: string;
        storeUuid?: string;
    }) {
        const limit = input.limit ?? 12;
        const cacheKey = `sa:analytics:snapshots:${input.type}:${input.tenantUuid ?? "platform"}:${limit}`;
    
        return withCache(cacheKey, 300, async () => {
            const snapshots = await prisma.analyticsSnapshot.findMany({
                where: {
                    type: input.type as any,
                    status: "COMPLETED",
                    ...(input.tenantUuid ? { tenantUuid: input.tenantUuid } : { tenantUuid: null }),
                    ...(input.storeUuid ? { storeUuid: input.storeUuid } : {}),
                },
                orderBy: { periodStart: "desc" },
                take: limit,
                select: {
                    uuid: true,
                    type: true,
                    granularity: true,
                    periodStart: true,
                    periodEnd: true,
                    metrics: true,
                    calculatedAt: true,
                },
            });
        
            return snapshots;
        });
    }
 
    // 8FRAUD ANALYTICS (live computed)
    static async getFraudAnalytics() {
        return withCache("sa:analytics:fraud", 120, async () => {
            const last30d = dayjs().subtract(30, "day").toDate();
        
            const [
                // Overview
                totalEvents,
                bySeverity,
        
                // Trend (last 30 days grouped)
                eventsByDay,
        
                // Top fraud types
                byType,
        
                // High risk users with scores
                highRiskUsers,
            ] = await Promise.all([
                prisma.fraudEvent.count(),
        
                prisma.fraudEvent.groupBy({
                    by: ["severity"],
                    _count: true,
                }),
        
                prisma.$queryRaw<{ date: Date; count: number }[]>`
                SELECT DATE("createdAt") as date, COUNT(*)::int as count
                FROM "FraudEvent"
                WHERE "createdAt" >= ${last30d}
                GROUP BY DATE("createdAt")
                ORDER BY date ASC
                `,
        
                prisma.fraudEvent.groupBy({
                    by: ["type"],
                    _count: true,
                    orderBy: { _count: { type: "desc" } },
                    take: 10,
                }),
        
                prisma.fraudEvent.groupBy({
                    by: ["userUuid"],
                    where: {
                        createdAt: { gte: last30d },
                        userUuid: { not: null },
                    },
                    _count: true,
                    orderBy: { _count: { userUuid: "desc" } },
                    take: 20,
                }),
            ]);
        
            // Build severity map
            const severityMap: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
            for (const s of bySeverity) {
                severityMap[s.severity] = s._count;
            }
        
            // Score high-risk users (LOW=1, MEDIUM=3, HIGH=6, CRITICAL=10)
            const SEVERITY_SCORES: Record<string, number> = {
                LOW: 1,
                MEDIUM: 3,
                HIGH: 6,
                CRITICAL: 10,
            };
        
            // Fetch fraud events for top users to calculate risk scores
            const topUserUuids = highRiskUsers
                .map((u) => u.userUuid)
                .filter((u): u is string => u !== null);
        
            let scoredUsers: { userUuid: string; score: number; eventCount: number }[] = [];
        
            if (topUserUuids.length > 0) {
                const userEvents = await prisma.fraudEvent.findMany({
                    where: { userUuid: { in: topUserUuids } },
                    select: { userUuid: true, severity: true },
                });
        
                const scoreMap = new Map<string, { score: number; count: number }>();
                for (const e of userEvents) {
                    if (!e.userUuid) continue;
                    const existing = scoreMap.get(e.userUuid) ?? { score: 0, count: 0 };
                    existing.score += SEVERITY_SCORES[e.severity] ?? 1;
                    existing.count++;
                    scoreMap.set(e.userUuid, existing);
                }
        
                scoredUsers = [...scoreMap.entries()]
                    .map(([userUuid, data]) => ({
                        userUuid,
                        score: data.score,
                        eventCount: data.count,
                    }))
                    .filter((u) => u.score >= 10)
                    .sort((a, b) => b.score - a.score);
            }
        
            return {
                total: totalEvents,
                bySeverity: severityMap,
                byType: byType.map((t) => ({
                    type: t.type,
                    count: t._count,
                })),
                trend: eventsByDay.map((d) => ({
                    date: dayjs(d.date).format("YYYY-MM-DD"),
                    count: d.count,
                })),
                highRiskUsers: scoredUsers,
                generatedAt: new Date().toISOString(),
            };
        });
    }
}