import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../infrastructure/cache/redis.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
 
 
export class ReconciliationDashboardService {

    //DAILY RECONCILIATION — per store, per day
    //Shows: orders vs payments match, cash/card breakdown, variance
    static async getDailyReport(storeUuid: string, date: Date) {
        const targetDate = dayjs(date).startOf("day").toDate();
    
        const report = await prisma.dailyReconciliation.findUnique({
            where: {
                storeUuid_date: { storeUuid, date: targetDate },
            },
        });
    
        if (!report) {
            return {
                status: "NOT_AVAILABLE",
                message: "Reconciliation report not yet generated for this date",
                date: targetDate,
                storeUuid,
            };
        };
    
        return {
            ...report,
            //human-readable summary
            summary: {
                isBalanced: !report.hasVariance,
                varianceFormatted: `${(report.totalVariance / 100).toFixed(2)}`,
                variancePercentFormatted: `${report.variancePercent.toFixed(2)}%`,
            },
        };
    }
 
    // RECONCILIATION HISTORY — trend over time for a store 
    static async getHistory(input: {
        storeUuid: string;
        days?: number;
    }) {
        const days = input.days ?? 30;
        const since = dayjs().subtract(days, "day").startOf("day").toDate();
    
        const cacheKey = `recon:history:${input.storeUuid}:${days}d`;
    
        return withCache(cacheKey, 300, async () => {
            const reports = await prisma.dailyReconciliation.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    date: { gte: since },
                },
                orderBy: { date: "desc" },
                select: {
                    date: true,
                    ordersCount: true,
                    ordersTotal: true,
                    cashDeclared: true,
                    cardDeclared: true,
                    totalDeclared: true,
                    totalVariance: true,
                    variancePercent: true,
                    hasVariance: true,
                    status: true,
                },
            });
        
            // Calculate summary stats
            const withVariance = reports.filter((r) => r.hasVariance);
            const totalVariance = reports.reduce(
                (sum, r) => sum + Math.abs(r.totalVariance),
                0
            );
        
            return {
                period: { days, since },
                reports,
                summary: {
                    totalDays: reports.length,
                    daysWithVariance: withVariance.length,
                    varianceRate:
                        reports.length > 0
                        ? Math.round((withVariance.length / reports.length) * 100)
                        : 0,
                    totalAbsoluteVariance: totalVariance,
                    averageVariance:
                        reports.length > 0
                        ? Math.round(totalVariance / reports.length)
                        : 0,
                },
            };
        });
    }
 
    //UNRESOLVED VARIANCES — stores needing attention
    //Tenant admin view: which stores have problems?
    static async getUnresolved(tenantUuid: string) {
        const cacheKey = `recon:unresolved:${tenantUuid}`;
    
        return withCache(cacheKey, 60, async () => {
            const unresolved = await prisma.dailyReconciliation.findMany({
                where: {
                    tenantUuid,
                    hasVariance: true,
                    status: { in: ["NEEDS_REVIEW", "IN_PROGRESS"] },
                },
                orderBy: [
                    { totalVariance: "desc" }, // Largest variance first
                    { date: "desc" },
                ],
                take: 50,
                include: {
                    store: { select: { name: true } },
                },
            });
        
            // Group by store for the dashboard
            const byStore = new Map<
                string,
                { storeName: string; reports: typeof unresolved; totalVariance: number }
            >();
        
            for (const report of unresolved) {
                const key = report.storeUuid;
                if (!byStore.has(key)) {
                    byStore.set(key, {
                        storeName: report.store?.name ?? "Unknown",
                        reports: [],
                        totalVariance: 0,
                    });
                }
                const entry = byStore.get(key)!;
                entry.reports.push(report);
                entry.totalVariance += Math.abs(report.totalVariance);
            }
        
            return {
                total: unresolved.length,
                storesAffected: byStore.size,
                stores: Array.from(byStore.entries()).map(([storeUuid, data]) => ({
                    storeUuid,
                    storeName: data.storeName,
                    unresolvedCount: data.reports.length,
                    totalVariance: data.totalVariance,
                    oldestUnresolved: data.reports[data.reports.length - 1]?.date,
                    latestVariance: data.reports[0]?.totalVariance,
                })),
            };
        });
    }
 
    //PROVIDER RECONCILIATION RESULTS
    //Shows Stripe/EVC reconciliation status and discrepancies
    static async getProviderReconciliation(input: {
        tenantUuid: string;
        provider?: string;
        days?: number;
    }) {
        const days = input.days ?? 30;
        const since = dayjs().subtract(days, "day").toDate();
    
        const cacheKey = `recon:provider:${input.tenantUuid}:${input.provider ?? "all"}:${days}d`;
    
        return withCache(cacheKey, 600, async () => {
            const reports = await prisma.paymentReconciliation.findMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    periodStart: { gte: since },
                    ...(input.provider && { provider: input.provider.toUpperCase() }),
                },
                orderBy: { periodStart: "desc" },
                select: {
                    uuid: true,
                    provider: true,
                    periodStart: true,
                    periodEnd: true,
                    ourPaymentCount: true,
                    ourPaymentTotal: true,
                    providerPaymentCount: true,
                    providerPaymentTotal: true,
                    netVariance: true,
                    hasDiscrepancy: true,
                    missingInOurSystem: true,
                    missingInProvider: true,
                    status: true,
                    createdAt: true,
                },
            });
    
            const withDiscrepancy = reports.filter((r) => r.hasDiscrepancy);
        
            return {
                period: { days, since },
                reports,
                summary: {
                    total: reports.length,
                    withDiscrepancy: withDiscrepancy.length,
                    totalNetVariance: reports.reduce(
                        (sum, r) => sum + Math.abs(r.netVariance),
                        0
                    ),
                    totalMissing: reports.reduce(
                        (sum, r) =>
                        sum +
                        (r.missingInOurSystem as string[]).length +
                        (r.missingInProvider as string[]).length,
                        0
                    ),
                },
            };
        });
    }

    //RESOLVE VARIANCE — mark a reconciliation as reviewed
    static async resolveVariance(input: {
        reconciliationUuid: string;
        resolvedBy: string;
        resolutionNotes: string;
        resolution: "EXPLAINED" | "CORRECTED" | "ACCEPTED" | "ESCALATED";
    }) {
        const report = await prisma.dailyReconciliation.findUnique({
            where: { uuid: input.reconciliationUuid },
        });
    
        if (!report) {
            throw new Error("RECONCILIATION_NOT_FOUND");
        }
    
        const updated = await prisma.dailyReconciliation.update({
            where: { uuid: input.reconciliationUuid },
            data: {
                status: input.resolution === "ESCALATED" ? "ESCALATED" : "RESOLVED",
                resolvedBy: input.resolvedBy,
                resolvedAt: new Date(),
                resolutionNotes: input.resolutionNotes,
            },
        });
    
        logWithContext("info", "[Reconciliation] Variance resolved", {
            reconciliationUuid: input.reconciliationUuid,
            resolution: input.resolution,
            resolvedBy: input.resolvedBy,
        });
    
        return updated;
    }
 
    // RECONCILIATION OVERVIEW — tenant-level summary card
    //For the tenant admin dashboard
    static async getOverview(tenantUuid: string) {
        const cacheKey = `recon:overview:${tenantUuid}`;
    
        return withCache(cacheKey, 120, async () => {
            const today = dayjs().startOf("day").toDate();
            const yesterday = dayjs().subtract(1, "day").startOf("day").toDate();
            const last7d = dayjs().subtract(7, "day").startOf("day").toDate();
        
            const [
                todayReports,
                yesterdayReports,
                unresolvedCount,
                last7dVarianceSum,
            ] = await Promise.all([
                // Today's status
                prisma.dailyReconciliation.findMany({
                    where: { tenantUuid, date: today },
                    select: { storeUuid: true, hasVariance: true, status: true },
                }),
        
                // Yesterday's status (most recently completed)
                prisma.dailyReconciliation.findMany({
                    where: { tenantUuid, date: yesterday },
                    select: {
                        storeUuid: true,
                        ordersTotal: true,
                        totalDeclared: true,
                        totalVariance: true,
                        hasVariance: true,
                        status: true,
                    },
                }),
        
                // Unresolved count
                prisma.dailyReconciliation.count({
                    where: {
                        tenantUuid,
                        hasVariance: true,
                        status: { in: ["NEEDS_REVIEW", "IN_PROGRESS"] },
                    },
                }),
        
                // Last 7 days total variance
                prisma.dailyReconciliation.aggregate({
                    where: {
                        tenantUuid,
                        date: { gte: last7d },
                        hasVariance: true,
                    },
                    _sum: { totalVariance: true },
                    _count: true,
                }),
            ]);
        
            return {
                today: {
                    storesReconciled: todayReports.length,
                    storesWithVariance: todayReports.filter((r) => r.hasVariance).length,
                },
                yesterday: {
                    storesReconciled: yesterdayReports.length,
                    totalRevenue: yesterdayReports.reduce(
                        (s, r) => s + r.totalDeclared,
                        0
                    ),
                    totalVariance: yesterdayReports.reduce(
                        (s, r) => s + Math.abs(r.totalVariance),
                        0
                    ),
                    storesWithVariance: yesterdayReports.filter((r) => r.hasVariance)
                        .length,
                },
                unresolved: unresolvedCount,
                last7Days: {
                    totalVariance: Math.abs(last7dVarianceSum._sum.totalVariance ?? 0),
                    daysWithVariance: last7dVarianceSum._count,
                },
                status:
                unresolvedCount === 0
                    ? "HEALTHY"
                    : unresolvedCount <= 3
                    ? "ATTENTION"
                    : "CRITICAL",
            };
        });
    }
}