import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../cache/cache.ts";

export class SuperAdminDashboardService {
    
    static async getOverview(input?: {
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const cacheKey = `dashboard:superadmin:overview:${input?.dateFrom || 'all'}:${input?.dateTo || 'all'}`;

        return withCache(cacheKey, 300, async () => {
            const dateFilter = input?.dateFrom && input?.dateTo
                ? { gte: input.dateFrom, lte: input.dateTo }
                : undefined;

            const [
                // Tenants
                totalTenants,
                activeTenants,
                trialingTenants,
                suspendedTenants,
                
                // Subscriptions
                activeSubscriptions,
                cancelledSubscriptions,
                
                // Revenue
                totalRevenue,
                periodRevenue,
                
                // Orders
                totalOrders,
                periodOrders,
                
                // Users
                totalUsers,
                
            ] = await Promise.all([
                // Tenants
                prisma.tenant.count(),
                prisma.tenant.count({ where: { status: "ACTIVE" } }),
                prisma.subscription.count({ where: { status: "TRIALING" } }),
                prisma.tenant.count({ where: { status: "SUSPENDED" } }),
            
                // Subscriptions
                prisma.subscription.count({ where: { status: "ACTIVE" } }),
                prisma.subscription.count({ where: { status: "CANCELLED" } }),
            
                // Revenue
                prisma.payment.aggregate({
                    where: { status: "COMPLETED" },
                    _sum: { amount: true },
                }),
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        createdAt: dateFilter,
                    },
                    _sum: { amount: true },
                }),
                
                // Orders
                prisma.order.count({ where: { status: "COMPLETED" } }),
                prisma.order.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: dateFilter,
                    },
                }),
                
                // Users
                prisma.user.count(),
            ]);

            // Calculate metrics
            const churnRate = activeTenants > 0
                ? (cancelledSubscriptions / (activeTenants + cancelledSubscriptions)) * 100
                : 0;

            return {
                tenants: {
                    total: totalTenants,
                    active: activeTenants,
                    trialing: trialingTenants,
                    suspended: suspendedTenants,
                    churnRate: Number(churnRate.toFixed(2)),
                },
                subscriptions: {
                active: activeSubscriptions,
                cancelled: cancelledSubscriptions,
                },
                revenue: {
                    total: totalRevenue._sum.amount || 0,
                    period: periodRevenue._sum.amount || 0,
                },
                orders: {
                    total: totalOrders,
                    period: periodOrders,
                },
                users: {
                    total: totalUsers,
                },
            };
        });
    }

    static async getPlatformHealth() {
        return withCache("dashboard:superadmin:health", 60, async () => {
            const now = new Date();
            const last24h = dayjs().subtract(24, "hour").toDate();
            const last7d = dayjs().subtract(7, "day").toDate();

            const [
                // System health
                uptime,
                
                // Recent activity
                ordersLast24h,
                paymentsLast24h,
                signupsLast24h,
                
                // Issues
                failedPayments24h,
                fraudEventsLast7d,
                suspiciousSessionsLast24h,
                
                // Performance
                avgOrderCompletionTime,
                
            ] = await Promise.all([
                // Uptime (you'd track this separately)
                Promise.resolve(99.9),
                
                // Recent activity
                prisma.order.count({
                    where: { createdAt: { gte: last24h } },
                }),
                prisma.payment.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: last24h },
                    },
                }),
                prisma.tenant.count({
                    where: { createdAt: { gte: last24h } },
                }),
                
                // Issues
                prisma.payment.count({
                    where: {
                        status: "FAILED",
                        createdAt: { gte: last24h },
                    },
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
                
                // Performance
                prisma.$queryRaw<{ avg_minutes: number }[]>`
                SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 60) as avg_minutes
                FROM "Order"
                WHERE status = 'COMPLETED'
                AND "completedAt" >= ${last24h}
                `,
            ]);

            return {
                uptime: uptime,
                activity: {
                    orders24h: ordersLast24h,
                    payments24h: paymentsLast24h,
                    signups24h: signupsLast24h,
                },
                issues: {
                    failedPayments24h,
                    fraudEvents7d: fraudEventsLast7d,
                    suspiciousSessions24h: suspiciousSessionsLast24h,
                },
                performance: {
                    avgOrderCompletionMinutes: avgOrderCompletionTime[0]?.avg_minutes || 0,
                },
            };
        });
    }

    static async getRevenueBreakdown(input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:superadmin:revenue:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;

        return withCache(cacheKey, 600, async () => {
            // Revenue by source
            const [subscriptionRevenue, orderRevenue] = await Promise.all([
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        paymentType: "SUBSCRIPTION",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                    _sum: { amount: true },
                }),
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        paymentType: "ORDER",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                    _sum: { amount: true },
                }),
            ]);

            // Revenue by plan
            const revenueByPlan = await prisma.subscription.groupBy({
                by: ["planUuid"],
                where: {
                    status: "ACTIVE",
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: { currentPeriodAmount: true },
                _count: { uuid: true },
            });

            const planDetails = await prisma.plan.findMany({
                where: { uuid: { in: revenueByPlan.map((r) => r.planUuid) } },
                select: { uuid: true, name: true, tier: true },
            });

            const revenueByPlanWithDetails = revenueByPlan.map((r) => {
                const plan = planDetails.find((p) => p.uuid === r.planUuid);
                return {
                    planName: plan?.name || "Unknown",
                    planTier: plan?.tier || "UNKNOWN",
                    revenue: r._sum.currentPeriodAmount || 0,
                    subscriptions: r._count.uuid,
                };
            });

            // MRR calculation
            const mrr = await prisma.subscription.aggregate({
                where: { status: "ACTIVE" },
                _sum: { currentPeriodAmount: true },
            });

            return {
                bySource: {
                    subscriptions: subscriptionRevenue._sum.amount || 0,
                    orders: orderRevenue._sum.amount || 0,
                },
                byPlan: revenueByPlanWithDetails,
                mrr: mrr._sum.currentPeriodAmount || 0,
            };
        });
    }

    static async getTenantAnalytics(input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:superadmin:tenants:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;

        return withCache(cacheKey, 600, async () => {
            // Get latest analytics snapshot
            const [arpuSnapshot, churnSnapshot, cohortSnapshot] = await Promise.all([
                prisma.analyticsSnapshot.findFirst({
                    where: { type: "ARPU_LTV" },
                    orderBy: { createdAt: "desc" },
                }),
                prisma.analyticsSnapshot.findFirst({
                    where: { type: "CHURN" },
                    orderBy: { createdAt: "desc" },
                }),
                prisma.analyticsSnapshot.findFirst({
                    where: { type: "TENANT_COHORT_GROWTH" },
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
                orderBy: { _sum: { amount: "desc" } },
                take: 10,
            });

            const tenantDetails = await prisma.tenant.findMany({
                where: { uuid: { in: topTenants.map((t) => t.tenantUuid) } },
                select: { uuid: true, name: true },
            });

            const topTenantsWithDetails = topTenants.map((t) => {
                const tenant = tenantDetails.find((td) => td.uuid === t.tenantUuid);
                return {
                    tenantUuid: t.tenantUuid,
                    tenantName: tenant?.name || "Unknown",
                    revenue: t._sum.amount || 0,
                };
            });

            return {
                arpu: (arpuSnapshot?.metrics as any)?.arpu || 0,
                ltv: (arpuSnapshot?.metrics as any)?.ltv || 0,
                churnRate: (churnSnapshot?.metrics as any)?.churnRate || 0,
                retentionRate: (churnSnapshot?.metrics as any)?.retentionRate || 100,
                topTenants: topTenantsWithDetails,
            };
        });
    }

    static async getGrowthMetrics(input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:superadmin:growth:${input.dateFrom.toISOString()}:${input.dateTo.toISOString()}`;

        return withCache(cacheKey, 600, async () => {
            const previousPeriodStart = dayjs(input.dateFrom)
                .subtract(dayjs(input.dateTo).diff(input.dateFrom, "day"), "day")
                .toDate();

            const [
                // Current period
                currentTenants,
                currentRevenue,
                currentOrders,
                
                // Previous period
                previousTenants,
                previousRevenue,
                previousOrders,
            ] = await Promise.all([
                // Current
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
                
                // Previous
                prisma.tenant.count({
                    where: { createdAt: { gte: previousPeriodStart, lt: input.dateFrom } },
                }),
                prisma.payment.aggregate({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: previousPeriodStart, lt: input.dateFrom },
                    },
                    _sum: { amount: true },
                }),
                prisma.order.count({
                    where: {
                        status: "COMPLETED",
                        createdAt: { gte: previousPeriodStart, lt: input.dateFrom },
                    },
                }),
            ]);

            const calculateGrowth = (current: number, previous: number) => {
                if (previous === 0) return current > 0 ? 100 : 0;
                return Number((((current - previous) / previous) * 100).toFixed(2));
            };

            return {
                tenants: {
                    current: currentTenants,
                    previous: previousTenants,
                    growth: calculateGrowth(currentTenants, previousTenants),
                },
                revenue: {
                    current: currentRevenue._sum.amount || 0,
                    previous: previousRevenue._sum.amount || 0,
                    growth: calculateGrowth(
                        currentRevenue._sum.amount || 0,
                        previousRevenue._sum.amount || 0
                    ),
                },
                orders: {
                    current: currentOrders,
                    previous: previousOrders,
                    growth: calculateGrowth(currentOrders, previousOrders),
                },
            };
        });
    }

    static async getRiskOverview() {
        return withCache("dashboard:superadmin:risk", 60, async () => {
            const last24h = dayjs().subtract(24, "hour").toDate();
            const last7d = dayjs().subtract(7, "day").toDate();

            const [
                // Fraud
                fraudEventsTotal,
                fraudEventsHigh,
                fraudEventsCritical,
                
                // Sessions
                suspiciousSessions,
                
                // Payments
                failedPayments,
                
                // High-risk users
                highRiskUsers,
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
                    where: {
                        status: "FAILED",
                        createdAt: { gte: last7d },
                    },
                }),
            
                prisma.fraudEvent.groupBy({
                    by: ["userUuid"],
                    where: {
                        severity: { in: ["HIGH", "CRITICAL"] },
                        createdAt: { gte: last7d },
                    },
                    _count: { uuid: true },
                    having: {
                        uuid: { _count: { gte: 3 } },
                    },
                }),
            ]);

            return {
                fraud: {
                    total: fraudEventsTotal,
                    high: fraudEventsHigh,
                    critical: fraudEventsCritical,
                },
                sessions: {
                    suspicious24h: suspiciousSessions,
                },
                payments: {
                    failed7d: failedPayments,
                },
                highRiskUsers: highRiskUsers.length,
            };
        });
    }

    static async getSystemAlerts() {
        return withCache("dashboard:superadmin:alerts", 30, async () => {
            const alerts = await prisma.adminAlert.findMany({
                where: {
                    status: { in: ["PENDING", "INVESTIGATING"] },
                },
                orderBy: { createdAt: "desc" },
                take: 20,
            });

            const grouped = {
                critical: alerts.filter((a) => a.level === "CRITICAL"),
                error: alerts.filter((a) => a.level === "ERROR"),
                warning: alerts.filter((a) => a.level === "WARNING"),
                info: alerts.filter((a) => a.level === "INFO"),
            };

            return {
                total: alerts.length,
                byLevel: {
                    critical: grouped.critical.length,
                    error: grouped.error.length,
                    warning: grouped.warning.length,
                    info: grouped.info.length,
                },
                recent: alerts.slice(0, 10),
            };
        });
    }
}