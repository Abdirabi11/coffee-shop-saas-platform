import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../cache/cache.ts";


interface TaxPeriodFilter {
    tenantUuid: string;
    storeUuid?: string;
    from: Date;
    to: Date;
}
 
export class TaxTrackingService {
    //TAX SUMMARY for a period
    //Total tax collected, breakdown by store, comparison to previous period
    static async getTaxSummary(filters: TaxPeriodFilter) {
        const { tenantUuid, storeUuid, from, to } = filters;
        const periodDays = dayjs(to).diff(from, "day");
        const prevFrom = dayjs(from).subtract(periodDays, "day").toDate();
    
        const cacheKey = `tax:summary:${tenantUuid}:${storeUuid ?? "all"}:${from.toISOString()}`;
    
        return withCache(cacheKey, 300, async () => {
            const storeWhere = storeUuid ? { storeUuid } : {};
        
            const [currentPeriod, previousPeriod, byStore] = await Promise.all([
                // Current period tax total
                prisma.payment.aggregate({
                    where: {
                        tenantUuid,
                        ...storeWhere,
                        status: { in: ["PAID", "COMPLETED"] },
                        createdAt: { gte: from, lte: to },
                    },
                    _sum: { tax: true, amount: true, subtotal: true },
                    _count: true,
                }),
        
                // Previous period for comparison
                prisma.payment.aggregate({
                    where: {
                        tenantUuid,
                        ...storeWhere,
                        status: { in: ["PAID", "COMPLETED"] },
                        createdAt: { gte: prevFrom, lt: from },
                    },
                    _sum: { tax: true },
                }),
        
                // Breakdown by store (skip if single store filter)
                storeUuid
                    ? Promise.resolve([])
                    : prisma.payment.groupBy({
                        by: ["storeUuid"],
                        where: {
                            tenantUuid,
                            status: { in: ["PAID", "COMPLETED"] },
                            createdAt: { gte: from, lte: to },
                        },
                        _sum: { tax: true, amount: true },
                        _count: true,
                        }),
            ]);
        
            // Hydrate store names
            let storeBreakdown: any[] = [];
            if (Array.isArray(byStore) && byStore.length > 0) {
                const storeUuids = byStore.map((s) => s.storeUuid);
                const stores = await prisma.store.findMany({
                    where: { uuid: { in: storeUuids } },
                    select: { uuid: true, name: true, taxRate: true },
                });
                const storeMap = new Map(stores.map((s) => [s.uuid, s]));
        
                storeBreakdown = byStore.map((s) => ({
                    storeUuid: s.storeUuid,
                    storeName: storeMap.get(s.storeUuid)?.name ?? "Unknown",
                    taxRate: Number(storeMap.get(s.storeUuid)?.taxRate ?? 0),
                    taxCollected: s._sum.tax ?? 0,
                    revenue: s._sum.amount ?? 0,
                    transactions: s._count,
                    effectiveRate:
                        (s._sum.amount ?? 0) > 0
                        ? Number((((s._sum.tax ?? 0) / (s._sum.amount ?? 0)) * 100).toFixed(2))
                        : 0,
                }));
            }
        
            const currentTax = currentPeriod._sum.tax ?? 0;
            const previousTax = previousPeriod._sum.tax ?? 0;
            const revenue = currentPeriod._sum.amount ?? 0;
        
            return {
                period: { from, to },
                taxCollected: currentTax,
                revenue,
                subtotal: currentPeriod._sum.subtotal ?? 0,
                transactions: currentPeriod._count,
                effectiveTaxRate:
                revenue > 0
                    ? Number(((currentTax / revenue) * 100).toFixed(2))
                    : 0,
                comparison: {
                    previousPeriodTax: previousTax,
                    change: currentTax - previousTax,
                    changePercent:
                        previousTax > 0
                        ? Number((((currentTax - previousTax) / previousTax) * 100).toFixed(2))
                        : 0,
                },
                byStore: storeBreakdown.sort((a, b) => b.taxCollected - a.taxCollected),
            };
        });
    }
 
    //MONTHLY TAX TREND
    //For accountants: monthly tax totals for the year
    static async getMonthlyTrend(tenantUuid: string, year?: number) {
        const targetYear = year ?? dayjs().year();
        const yearStart = dayjs().year(targetYear).startOf("year").toDate();
        const yearEnd = dayjs().year(targetYear).endOf("year").toDate();
    
        const cacheKey = `tax:monthly:${tenantUuid}:${targetYear}`;
    
        return withCache(cacheKey, 1800, async () => {
            // Use StoreDailyMetrics for fast aggregation (already pre-computed)
            const dailyMetrics = await prisma.storeDailyMetrics.findMany({
                where: {
                    tenantUuid,
                    date: { gte: yearStart, lte: yearEnd },
                },
                select: { date: true, revenueTax: true, revenueGross: true },
            });
    
            // Group by month
            const monthlyMap = new Map<string, { tax: number; revenue: number }>();
        
            for (const m of dailyMetrics) {
                const monthKey = dayjs(m.date).format("YYYY-MM");
                const existing = monthlyMap.get(monthKey) ?? { tax: 0, revenue: 0 };
                existing.tax += m.revenueTax;
                existing.revenue += m.revenueGross;
                monthlyMap.set(monthKey, existing);
            };
    
            // Build all 12 months (even empty ones)
            const months = [];
            for (let i = 0; i < 12; i++) {
                const monthKey = dayjs().year(targetYear).month(i).format("YYYY-MM");
                const data = monthlyMap.get(monthKey) ?? { tax: 0, revenue: 0 };
                months.push({
                    month: monthKey,
                    label: dayjs().year(targetYear).month(i).format("MMMM"),
                    taxCollected: data.tax,
                    revenue: data.revenue,
                    effectiveRate:
                        data.revenue > 0
                        ? Number(((data.tax / data.revenue) * 100).toFixed(2))
                        : 0,
                });
            }
    
            const yearTotal = months.reduce((s, m) => s + m.taxCollected, 0);
        
            return {
                year: targetYear,
                months,
                yearTotal,
                yearRevenue: months.reduce((s, m) => s + m.revenue, 0),
            };
        });
    }
 
    //TAX BY PAYMENT METHOD
    //Cash vs card vs mobile money tax breakdown
    static async getTaxByPaymentMethod(filters: TaxPeriodFilter) {
        const { tenantUuid, storeUuid, from, to } = filters;
    
        return withCache(
            `tax:by-method:${tenantUuid}:${storeUuid ?? "all"}:${from.toISOString()}`,
            600,
            async () => {
                const grouped = await prisma.payment.groupBy({
                    by: ["paymentMethod"],
                    where: {
                        tenantUuid,
                        ...(storeUuid && { storeUuid }),
                        status: { in: ["PAID", "COMPLETED"] },
                        createdAt: { gte: from, lte: to },
                    },
                    _sum: { tax: true, amount: true },
                    _count: true,
                });
        
                const total = grouped.reduce((s, g) => s + (g._sum.tax ?? 0), 0);
        
                return grouped.map((g) => ({
                    paymentMethod: g.paymentMethod,
                    taxCollected: g._sum.tax ?? 0,
                    revenue: g._sum.amount ?? 0,
                    transactions: g._count,
                    percentOfTotal:
                        total > 0
                        ? Number((((g._sum.tax ?? 0) / total) * 100).toFixed(2))
                        : 0,
                }));
            }
        );
    }
 
    //TAX REFUND TRACKING
    //How much tax was returned via refunds
    static async getTaxRefunds(filters: TaxPeriodFilter) {
        const { tenantUuid, storeUuid, from, to } = filters;
    
        return withCache(
            `tax:refunds:${tenantUuid}:${storeUuid ?? "all"}:${from.toISOString()}`,
            600,
            async () => {
                // Calculate tax portion of refunds
                // Refund amount / original payment amount * original tax = refunded tax
                const refunds = await prisma.refund.findMany({
                    where: {
                        tenantUuid,
                        ...(storeUuid && { storeUuid }),
                        status: "COMPLETED",
                        processedAt: { gte: from, lte: to },
                    },
                    include: {
                        payment: { select: { amount: true, tax: true } },
                    },
                });
        
                let totalRefundedTax = 0;
        
                for (const refund of refunds) {
                    if (refund.payment.amount > 0 && refund.payment.tax > 0) {
                        const taxPortion =
                        (refund.amount / refund.payment.amount) * refund.payment.tax;
                        totalRefundedTax += Math.round(taxPortion);
                    }
                }
        
                return {
                    period: { from, to },
                    totalRefunds: refunds.length,
                    totalRefundedAmount: refunds.reduce((s, r) => s + r.amount, 0),
                    totalRefundedTax,
                };
            }
        );
    }
 
    //NET TAX LIABILITY
    //Tax collected minus tax refunded = what you owe
    static async getNetTaxLiability(filters: TaxPeriodFilter) {
        const [summary, refunds] = await Promise.all([
            this.getTaxSummary(filters),
            this.getTaxRefunds(filters),
        ]);
    
        return {
            period: { from: filters.from, to: filters.to },
            taxCollected: summary.taxCollected,
            taxRefunded: refunds.totalRefundedTax,
            netTaxLiability: summary.taxCollected - refunds.totalRefundedTax,
            revenue: summary.revenue,
        };
    }
}
