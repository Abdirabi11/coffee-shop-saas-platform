import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";


interface DateRange {
    dateFrom?: Date;
    dateTo?: Date;
}
 
function buildDateFilter(dateFrom?: Date, dateTo?: Date) {
    if (!dateFrom || !dateTo) return undefined;
    return { gte: dateFrom, lte: dateTo };
}
 
function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
}
 
export class SuperAdminDashboardService {
   //PLATFORM OVERVIEW (Tenant counts, subscription stats, revenue, orders, users)

    static async getOverview(input?: DateRange) {
        const cacheKey = `sa:dashboard:overview:${input?.dateFrom?.toISOString() ?? "all"}:${input?.dateTo?.toISOString() ?? "all"}`;
    
        return withCache(cacheKey, 300, async () => {
            const timer = MetricsService.startTimer("dashboard_build", { role: "super_admin", section: "overview" });
        
            try {
                const dateFilter = buildDateFilter(input?.dateFrom, input?.dateTo);
        
                const [
                    // Tenants
                    totalTenants,
                    activeTenants,
                    suspendedTenants,
            
                    // Subscriptions
                    activeSubscriptions,
                    trialingSubscriptions,
                    cancelledSubscriptions,
            
                    // Revenue — uses COMPLETED (not SUCCESS) per PaymentStatus enum
                    totalRevenue,
                    periodRevenue,
            
                    // Orders
                    totalOrders,
                    periodOrders,
        
                    // Users
                    totalUsers,
            
                    // Stores — field is `active` not `isActive`
                    totalStores,
                    activeStores,
                ] = await Promise.all([
                    // Tenants — uses `status` field (TenantStatus enum)
                    prisma.tenant.count(),
                    prisma.tenant.count({ where: { status: "ACTIVE" } }),
                    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
            
                    // Subscriptions
                    prisma.subscription.count({ where: { status: "ACTIVE" } }),
                    prisma.subscription.count({ where: { status: "TRIALING" } }),
                    prisma.subscription.count({
                        where: { status: { in: ["CANCELLED", "EXPIRED"] } },
                    }),
        
                    // Revenue — PaymentStatus.COMPLETED
                    prisma.payment.aggregate({
                        where: { status: "COMPLETED" },
                        _sum: { amount: true },
                    }),
                    prisma.payment.aggregate({
                        where: {
                            status: "COMPLETED",
                            ...(dateFilter ? { createdAt: dateFilter } : {}),
                        },
                        _sum: { amount: true },
                    }),
            
                    // Orders
                    prisma.order.count({ where: { status: "COMPLETED" } }),
                    prisma.order.count({
                        where: {
                            status: "COMPLETED",
                            ...(dateFilter ? { createdAt: dateFilter } : {}),
                        },
                    }),
            
                    // Users
                    prisma.user.count(),
            
                    // Stores — `active` Boolean field
                    prisma.store.count(),
                    prisma.store.count({ where: { active: true } }),
                ]);
        
                // Churn rate: cancelled / (active + cancelled)
                const churnDenom = activeSubscriptions + cancelledSubscriptions;
                const churnRate =
                churnDenom > 0
                    ? Number(((cancelledSubscriptions / churnDenom) * 100).toFixed(2))
                    : 0;
        
                return {
                    tenants: {
                        total: totalTenants,
                        active: activeTenants,
                        suspended: suspendedTenants,
                        churnRate,
                    },
                    subscriptions: {
                        active: activeSubscriptions,
                        trialing: trialingSubscriptions,
                        cancelled: cancelledSubscriptions,
                    },
                    revenue: {
                        total: totalRevenue._sum.amount ?? 0,
                        period: periodRevenue._sum.amount ?? 0,
                    },
                    orders: {
                        total: totalOrders,
                        period: periodOrders,
                    },
                    stores: {
                        total: totalStores,
                        active: activeStores,
                    },
                    users: {
                        total: totalUsers,
                    },
                    generatedAt: new Date().toISOString(),
                };
            } finally {
                timer.end();
            }
        });
    }
 
    //PLATFORM HEALTH (Last 24h activity, issues, performance)
    static async getPlatformHealth() {
        return withCache("sa:dashboard:health", 60, async () => {
            const last24h = dayjs().subtract(24, "hour").toDate();
            const last7d = dayjs().subtract(7, "day").toDate();
        
            const [
                // Activity
                ordersLast24h,
                paymentsLast24h,
                signupsLast24h,
        
                // Issues
                failedPayments24h,
                fraudEvents7d,
                suspiciousSessions24h,
        
                // Tenant health
                activeTenants,
                suspendedTenants,
        
                // Performance — avg order completion time
                avgOrderCompletionTime,
            ] = await Promise.all([
                prisma.order.count({
                where: { createdAt: { gte: last24h } },
                }),
                prisma.payment.count({
                where: { status: "COMPLETED", createdAt: { gte: last24h } },
                }),
                prisma.tenant.count({
                where: { createdAt: { gte: last24h } },
                }),
        
                // Issues
                prisma.payment.count({
                where: { status: "FAILED", createdAt: { gte: last24h } },
                }),
                prisma.fraudEvent.count({
                where: { createdAt: { gte: last7d } },
                }),
                prisma.session.count({
                where: {
                    riskLevel: { in: ["HIGH", "CRITICAL"] },
                    createdAt: { gte: last24h },
                },
                }),
        
                // Tenant status
                prisma.tenant.count({ where: { status: "ACTIVE" } }),
                prisma.tenant.count({ where: { status: "SUSPENDED" } }),
        
                // Performance
                prisma.$queryRaw<{ avg_minutes: number }[]>`
                SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 60) as avg_minutes
                FROM "Order"
                WHERE status = 'COMPLETED'
                AND "completedAt" IS NOT NULL
                AND "completedAt" >= ${last24h}
                `,
            ]);
        
            return {
                activity: {
                orders24h: ordersLast24h,
                payments24h: paymentsLast24h,
                signups24h: signupsLast24h,
                },
                issues: {
                failedPayments24h,
                fraudEvents7d,
                    suspiciousSessions24h,
                },
                tenants: {
                    active: activeTenants,
                    suspended: suspendedTenants,
                },
                performance: {
                    avgOrderCompletionMinutes: Number(
                        (avgOrderCompletionTime[0]?.avg_minutes ?? 0).toFixed(2)
                    ),
                },
                generatedAt: new Date().toISOString(),
            };
        });
    }
    
    //REVENUE BREAKDOWN (By source (subscriptions vs orders), by plan, MRR) 
    static async getRevenueBreakdown(input: { dateFrom: Date; dateTo: Date }) {
        const cacheKey = `sa:dashboard:revenue:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;
    
        return withCache(cacheKey, 600, async () => {
            // Revenue by payment flow (provider vs cashier)
            const revenueByFlow = await prisma.payment.groupBy({
                by: ["paymentFlow"],
                where: {
                    status: "COMPLETED",
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { amount: true },
                _count: true,
            });
    
            // Revenue by payment method
            const revenueByMethod = await prisma.payment.groupBy({
                by: ["paymentMethod"],
                where: {
                    status: "COMPLETED",
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { amount: true },
                _count: true,
            });
        
            // Invoice revenue (subscription billing)
            const invoiceRevenue = await prisma.invoice.aggregate({
                where: {
                    status: "PAID",
                    paidAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { total: true },
                _count: true,
            });
    
            // Revenue by plan — Subscription -> Plan relation
            const revenueByPlan = await prisma.subscription.groupBy({
                by: ["planUuid"],
                where: {
                    status: "ACTIVE",
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { currentPeriodAmount: true },
                _count: { uuid: true },
            });
        
            const planUuids = revenueByPlan.map((r) => r.planUuid);
            const plans = await prisma.plan.findMany({
                where: { uuid: { in: planUuids } },
                select: { uuid: true, name: true, tier: true },
            });
            const planMap = new Map(plans.map((p) => [p.uuid, p]));
        
            // MRR from active subscriptions
            const mrr = await prisma.subscription.aggregate({
                where: { status: "ACTIVE" },
                _sum: { currentPeriodAmount: true },
            });
    
            return {
                byFlow: revenueByFlow.map((r) => ({
                    flow: r.paymentFlow,
                    revenue: r._sum.amount ?? 0,
                    count: r._count,
                })),
                byMethod: revenueByMethod.map((r) => ({
                    method: r.paymentMethod,
                    revenue: r._sum.amount ?? 0,
                    count: r._count,
                })),
                invoices: {
                    revenue: invoiceRevenue._sum.total ?? 0,
                    count: invoiceRevenue._count,
                },
                byPlan: revenueByPlan.map((r) => ({
                    planUuid: r.planUuid,
                    planName: planMap.get(r.planUuid)?.name ?? "Unknown",
                    planTier: planMap.get(r.planUuid)?.tier ?? "UNKNOWN",
                    revenue: r._sum.currentPeriodAmount ?? 0,
                    subscriptions: r._count.uuid,
                })),
                mrr: mrr._sum.currentPeriodAmount ?? 0,
                generatedAt: new Date().toISOString(),
            };
        });
    }
 
    //TENANT ANALYTICS (Top tenants, ARPU, LTV, churn (from latest snapshots) )
    static async getTenantAnalytics(input: { dateFrom: Date; dateTo: Date }) {
        const cacheKey = `sa:dashboard:tenants:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;
    
        return withCache(cacheKey, 600, async () => {
            // Latest analytics snapshots (from jobs)
            const [arpuSnapshot, churnSnapshot] = await Promise.all([
                prisma.analyticsSnapshot.findFirst({
                    where: { type: "ARPU_LTV", status: "COMPLETED" },
                    orderBy: { createdAt: "desc" },
                }),
                prisma.analyticsSnapshot.findFirst({
                    where: { type: "CHURN", status: "COMPLETED" },
                    orderBy: { createdAt: "desc" },
                }),
            ]);
        
            // Top tenants by revenue
            const topTenants = await prisma.payment.groupBy({
                by: ["tenantUuid"],
                where: {
                    status: "COMPLETED",
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { amount: true },
                _count: true,
                orderBy: { _sum: { amount: "desc" } },
                take: 10,
            });
        
            const tenantUuids = topTenants.map((t) => t.tenantUuid);
            const tenants = await prisma.tenant.findMany({
                where: { uuid: { in: tenantUuids } },
                select: { uuid: true, name: true, createdAt: true },
            });
            const tenantMap = new Map(tenants.map((t) => [t.uuid, t]));
        
            // Subscription breakdown by plan
            const subscriptionsByPlan = await prisma.subscription.groupBy({
                by: ["planUuid"],
                where: { status: "ACTIVE" },
                _count: { uuid: true },
            });
        
            const planUuids = subscriptionsByPlan.map((s) => s.planUuid);
            const plans = await prisma.plan.findMany({
                where: { uuid: { in: planUuids } },
                select: { uuid: true, name: true, tier: true },
            });
            const planMap = new Map(plans.map((p) => [p.uuid, p]));
        
            return {
                arpu: ((arpuSnapshot?.metrics as any)?.arpu) ?? 0,
                ltv: ((arpuSnapshot?.metrics as any)?.ltv) ?? 0,
                churnRate: ((churnSnapshot?.metrics as any)?.churnRate) ?? 0,
                retentionRate: ((churnSnapshot?.metrics as any)?.retentionRate) ?? 100,
                topTenants: topTenants.map((t) => ({
                    tenantUuid: t.tenantUuid,
                    name: tenantMap.get(t.tenantUuid)?.name ?? "Unknown",
                    memberSince: tenantMap.get(t.tenantUuid)?.createdAt,
                    revenue: t._sum.amount ?? 0,
                    orderCount: t._count,
                })),
                subscriptionBreakdown: subscriptionsByPlan.map((s) => ({
                    planUuid: s.planUuid,
                    planName: planMap.get(s.planUuid)?.name ?? "Unknown",
                    planTier: planMap.get(s.planUuid)?.tier ?? "UNKNOWN",
                    count: s._count.uuid,
                })),
                generatedAt: new Date().toISOString(),
            };
        });
    }
 
    //GROWTH METRICS
    static async getGrowthMetrics(input: { dateFrom: Date; dateTo: Date }) {
        const cacheKey = `sa:dashboard:growth:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;
    
        return withCache(cacheKey, 600, async () => {
            const periodDays = dayjs(input.dateTo).diff(input.dateFrom, "day");
            const previousStart = dayjs(input.dateFrom).subtract(periodDays, "day").toDate();
        
            const [
                currentTenants,
                currentRevenue,
                currentOrders,
                previousTenants,
                previousRevenue,
                previousOrders,
            ] = await Promise.all([
                prisma.tenant.count({
                    where: { createdAt: { gte: input.dateFrom, lte: input.dateTo } },
                }),
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                    _sum: { amount: true },
                }),
                prisma.order.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                }),
        
                prisma.tenant.count({
                    where: { createdAt: { gte: previousStart, lt: input.dateFrom } },
                }),
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: previousStart, lt: input.dateFrom },
                    },
                    _sum: { amount: true },
                }),
                prisma.order.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: previousStart, lt: input.dateFrom },
                    },
                }),
            ]);
    
            const curRev = currentRevenue._sum.amount ?? 0;
            const prevRev = previousRevenue._sum.amount ?? 0;
    
            return {
                tenants: {
                    current: currentTenants,
                    previous: previousTenants,
                    growth: percentChange(currentTenants, previousTenants),
                },
                revenue: {
                    current: curRev,
                    previous: prevRev,
                    growth: percentChange(curRev, prevRev),
                },
                orders: {
                    current: currentOrders,
                    previous: previousOrders,
                    growth: percentChange(currentOrders, previousOrders),
                },
                generatedAt: new Date().toISOString(),
            };
        });
    }

    //RISK OVERVIEW (Fraud events, suspicious sessions, failed payments, high-risk users)
    static async getRiskOverview() {
        return withCache("sa:dashboard:risk", 60, async () => {
            const last24h = dayjs().subtract(24, "hour").toDate();
            const last7d = dayjs().subtract(7, "day").toDate();
        
            const [
                // Fraud by severity
                fraudTotal,
                fraudHigh,
                fraudCritical,
        
                // Sessions
                suspiciousSessions,
        
                // Payments
                failedPayments7d,
        
                // High-risk users (3+ HIGH/CRITICAL events in 7 days)
                highRiskUsers,
        
                // Suspended tenants
                suspendedTenants,
            ] = await Promise.all([
                prisma.fraudEvent.count(),
                prisma.fraudEvent.count({ where: { severity: "HIGH" } }),
                prisma.fraudEvent.count({ where: { severity: "CRITICAL" } }),
        
                prisma.session.count({
                    where: {
                        riskLevel: { in: ["HIGH", "CRITICAL"] },
                        createdAt: { gte: last24h },
                    },
                }),
        
                prisma.payment.count({
                    where: { status: "FAILED", createdAt: { gte: last7d } },
                }),
        
                prisma.fraudEvent.groupBy({
                    by: ["userUuid"],
                    where: {
                        severity: { in: ["HIGH", "CRITICAL"] },
                        createdAt: { gte: last7d },
                        userUuid: { not: null },
                    },
                    _count: { uuid: true },
                    having: { uuid: { _count: { gte: 3 } } },
                }),
        
                prisma.tenant.count({ where: { status: "SUSPENDED" } }),
            ]);
        
            return {
                fraud: {
                    total: fraudTotal,
                    high: fraudHigh,
                    critical: fraudCritical,
                },
                sessions: {
                    suspicious24h: suspiciousSessions,
                },
                payments: {
                    failed7d: failedPayments7d,
                },
                highRiskUsers: highRiskUsers.length,
                suspendedTenants,
                generatedAt: new Date().toISOString(),
            };
        });
    }

    //SYSTEM ALERTS (From AdminAlert model, grouped by level)
    static async getSystemAlerts(limit: number = 20) {
        return withCache(`sa:dashboard:alerts:${limit}`, 30, async () => {
            const alerts = await prisma.adminAlert.findMany({
                where: {
                    status: { in: ["ACTIVE", "ACKNOWLEDGED", "IN_PROGRESS"] },
                },
                orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
                take: limit,
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                    alertType: true,
                    category: true,
                    level: true,
                    title: true,
                    message: true,
                    status: true,
                    priority: true,
                    source: true,
                    assignedTo: true,
                    escalated: true,
                    createdAt: true,
                },
            });
        
            const byLevel = {
                CRITICAL: 0,
                ERROR: 0,
                WARNING: 0,
                INFO: 0,
            };
        
            for (const alert of alerts) {
                const level = alert.level as keyof typeof byLevel;
                if (level in byLevel) byLevel[level]++;
            }
        
            return {
                total: alerts.length,
                byLevel,
                alerts,
                generatedAt: new Date().toISOString(),
            };
        });
    }

    //TENANT HEALTH (Past-due, trial, near limits, recently suspended
    static async getTenantHealth() {
        return withCache("sa:dashboard:tenant-health", 120, async () => {
            const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
            const [pastDue, trialing, recentlySuspended, tenants] = await Promise.all([
                prisma.subscription.count({ where: { status: "PAST_DUE" } }),
                prisma.subscription.count({ where: { status: "TRIALING" } }),
                prisma.tenant.count({
                    where: {
                        status: "SUSPENDED",
                        updatedAt: { gte: recentCutoff },
                    },
                }),
                // Tenants near limits
                prisma.tenant.findMany({
                    where: { status: "ACTIVE" },
                    select: {
                        uuid: true,
                        maxStores: true,
                        maxUsers: true,
                        _count: {
                            select: {
                                stores: true,
                                users: true,
                            },
                        },
                    },
                }),
            ]);
        
            const nearLimits = tenants.filter((t) => {
                return (
                    t._count.stores >= t.maxStores * 0.8 ||
                    t._count.users >= t.maxUsers * 0.8
                );
            }).length;
        
            return {
                pastDue,
                trialing,
                recentlySuspended,
                nearLimits,
                generatedAt: new Date().toISOString(),
            };
        });
    }
 
    //TENANT LIST (for admin table)
    static async getTenantList(input?: {
        status?: string;
        limit?: number;
        offset?: number;
    }) {
        const limit = input?.limit ?? 50;
        const offset = input?.offset ?? 0;
        const statusFilter = input?.status
            ? { status: input.status as any }
            : {};
    
        const cacheKey = `sa:dashboard:tenant-list:${input?.status ?? "all"}:${limit}:${offset}`;
    
        return withCache(cacheKey, 120, async () => {
            const [tenants, total] = await Promise.all([
                prisma.tenant.findMany({
                    where: statusFilter,
                    include: {
                        subscription: {
                            select: {
                                status: true,
                                plan: { select: { name: true, tier: true } },
                            },
                        },
                        _count: {
                            select: { stores: true, users: true },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: limit,
                    skip: offset,
                }),
                prisma.tenant.count({ where: statusFilter }),
            ]);
    
            return {
                tenants: tenants.map((t) => ({
                    uuid: t.uuid,
                    name: t.name,
                    status: t.status,
                    subscription: t.subscription
                        ? {
                            status: t.subscription.status,
                            planName: t.subscription.plan.name,
                            planTier: t.subscription.plan.tier,
                        }
                        : null,
                    storesCount: t._count.stores,
                    usersCount: t._count.users,
                    createdAt: t.createdAt,
                })),
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + limit < total,
                },
            };
        });
    }
}