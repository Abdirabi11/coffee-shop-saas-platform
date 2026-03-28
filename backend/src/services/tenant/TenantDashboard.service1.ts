import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../cache/cache.ts";
import { getCacheVersion } from "../../cache/cacheVersion.ts";

export class TenantDashboardService {

    static async getOverview(tenantUuid: string, input?: {
        dateFrom?: Date;
        dateTo?: Date;
    }){
        const version = await getCacheVersion(`tenant:${tenantUuid}:dashboard`);
        const cacheKey = `dashboard:tenant:${tenantUuid}:overview:v${version}`;

        return withCache(cacheKey, 120, async () => {
            const dateFilter = input?.dateFrom && input?.dateTo
                ? { gte: input.dateFrom, lte: input.dateTo }
                : undefined;

            const [
                // Stores
                totalStores,
                activeStores,
                
                // Orders
                totalOrders,
                activeOrders,
                completedOrders,
                cancelledOrders,
                
                // Revenue
                totalRevenue,
                
                // Customers
                totalCustomers,
                activeCustomers,
                
                // Staff
                totalStaff,
                
                // Products
                totalProducts,
            ] = await Promise.all([
                // Stores
                prisma.store.count({ where: { tenantUuid } }),
                prisma.store.count({ where: { tenantUuid, isActive: true } }),
                
                // Orders
                prisma.order.count({
                    where: { tenantUuid, createdAt: dateFilter },
                }),
                prisma.order.count({
                    where: {
                        tenantUuid,
                        status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                    },
                }),
                prisma.order.count({
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: dateFilter,
                    },
                }),
                prisma.order.count({
                    where: {
                        tenantUuid,
                        status: "CANCELLED",
                        createdAt: dateFilter,
                    },
                }),
        
                // Revenue
                prisma.payment.aggregate({
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: dateFilter,
                    },
                    _sum: { amount: true },
                }),
                
                // Customers
                prisma.tenantUser.count({
                    where: { tenantUuid, role: "CUSTOMER" },
                }),
                prisma.tenantUser.count({
                    where: {
                        tenantUuid,
                        role: "CUSTOMER",
                        user: {
                            orders: {
                                some: {
                                    createdAt: dateFilter || { gte: dayjs().subtract(30, "day").toDate() },
                                },
                            },
                        },
                    },
                }),
        
                // Staff
                prisma.tenantUser.count({
                    where: {
                        tenantUuid,
                        role: { in: ["MANAGER", "CASHIER"] },
                        isActive: true,
                    },
                }),
        
                // Products
                prisma.product.count({ where: { tenantUuid } }),
            ]);

            const completionRate = totalOrders > 0
                ? (completedOrders / totalOrders) * 100
                : 0;

            return {
                stores: {
                    total: totalStores,
                    active: activeStores,
                },
                orders: {
                    total: totalOrders,
                    active: activeOrders,
                    completed: completedOrders,
                    cancelled: cancelledOrders,
                    completionRate: Number(completionRate.toFixed(2)),
                },
                revenue: {
                    total: totalRevenue._sum.amount || 0,
                },
                customers: {
                    total: totalCustomers,
                    active: activeCustomers,
                },
                staff: {
                    total: totalStaff,
                },
                products: {
                    total: totalProducts,
                },
            }
        })
    }

    static async getStorePerformance(tenantUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:tenant:${tenantUuid}:stores:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            const storeMetrics = await prisma.storeDailyMetrics.groupBy({
                by: ["storeUuid"],
                where: {
                    store: { tenantUuid },
                    date: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: {
                    totalRevenue: true,
                    ordersCount: true,
                },
                _avg: {
                    avgPrepTimeMin: true,
                },
            });

            const stores = await prisma.store.findMany({
                where: { uuid: { in: storeMetrics.map((s) => s.storeUuid) } },
                select: { uuid: true, name: true },
            });

            return storeMetrics.map((m) => {
                const store = stores.find((s) => s.uuid === m.storeUuid);
                return {
                    storeUuid: m.storeUuid,
                    storeName: store?.name || "Unknown",
                    revenue: m._sum.totalRevenue || 0,
                    orders: m._sum.ordersCount || 0,
                    avgPrepTime: m._avg.avgPrepTimeMin || 0,
                };
            }).sort((a, b) => b.revenue - a.revenue);
        });
    }

    //Get top products across all stores
    static async getTopProducts(tenantUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
        limit?: number;
    }) {
        const cacheKey = `dashboard:tenant:${tenantUuid}:products:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            const productMetrics = await prisma.productDailyMetrics.groupBy({
                by: ["productUuid"],
                where: {
                    product: { tenantUuid },
                    date: { gte: input.dateFrom, lte: input.dateTo },
                },
                _sum: {
                    quantitySold: true,
                    revenueGross: true,
                },
                orderBy: {
                    _sum: { quantitySold: "desc" },
                },
                take: input.limit || 10,
            });

            const products = await prisma.product.findMany({
                where: { uuid: { in: productMetrics.map((p) => p.productUuid) } },
                select: { uuid: true, name: true, basePrice: true, imageUrls: true },
            });

            return productMetrics.map((m) => {
                const product = products.find((p) => p.uuid === m.productUuid);
                return {
                    product,
                    quantitySold: m._sum.quantitySold || 0,
                    revenue: m._sum.revenueGross || 0,
                };
            });
        });
    }

    static async getRevenueTrend(tenantUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
        groupBy: "day" | "week" | "month";
    }) {
        const cacheKey = `dashboard:tenant:${tenantUuid}:revenue:${input.groupBy}:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            const metrics = await prisma.orderDailyMetrics.findMany({
                where: {
                    tenantUuid,
                    date: { gte: input.dateFrom, lte: input.dateTo },
                },
                orderBy: { date: "asc" },
            });

            if (input.groupBy === "day") {
                return metrics.map((m) => ({
                    date: m.date,
                    revenue: m.totalRevenue,
                    orders: m.totalOrders,
                }));
            };

            // Group by week or month
            const grouped = new Map<string, { revenue: number; orders: number }>();

            metrics.forEach((m) => {
                const key = input.groupBy === "week"
                    ? dayjs(m.date).format("YYYY-[W]WW")
                    : dayjs(m.date).format("YYYY-MM");

                const current = grouped.get(key) || { revenue: 0, orders: 0 };
                grouped.set(key, {
                    revenue: current.revenue + m.totalRevenue,
                    orders: current.orders + m.totalOrders,
                });
            });

            return Array.from(grouped.entries()).map(([date, data]) => ({
                date,
                revenue: data.revenue,
                orders: data.orders,
            }));
        });
    }

    static async getCustomerInsights(tenantUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:tenant:${tenantUuid}:customers:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            const [
                newCustomers,
                repeatCustomers,
                topCustomers,
                avgOrderValue,
            ] = await Promise.all([
                // New customers
                prisma.tenantUser.count({
                    where: {
                        tenantUuid,
                        role: "CUSTOMER",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                }),
                
                // // Repeat customers (2+ orders in period)
                // prisma.$queryRaw<{ count: bigint }[]>`
                // SELECT COUNT(DISTINCT "userUuid")::bigint as count
                // FROM "Order"
                // WHERE "tenantUuid" = ${tenantUuid}
                // AND "createdAt" >= ${input.dateFrom}
                // AND "createdAt" <= ${input.dateTo}
                // GROUP BY "userUuid"
                // HAVING COUNT(*) >= 2
                // `,
                
                // Top customers by revenue
                prisma.order.groupBy({
                    by: ["userUuid"],
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                    _sum: { totalAmount: true },
                    _count: { uuid: true },
                    orderBy: { _sum: { totalAmount: "desc" } },
                    take: 10,
                }),
                
                // Avg order value
                prisma.order.aggregate({
                    where: {
                        tenantUuid,
                        status: "COMPLETED",
                        createdAt: { gte: input.dateFrom, lte: input.dateTo },
                    },
                    _avg: { totalAmount: true },
                }),
            ]);

            const customerDetails = await prisma.user.findMany({
                where: { uuid: { in: topCustomers.map((c) => c.userUuid!) } },
                select: { uuid: true, name: true, phoneNumber: true },
            });

            const topCustomersWithDetails = topCustomers.map((c) => {
                const customer = customerDetails.find((cd) => cd.uuid === c.userUuid);
                return {
                    customerUuid: c.userUuid,
                    customerName: customer?.name || "Unknown",
                    customerPhone: customer?.phoneNumber,
                    totalSpent: c._sum.totalAmount || 0,
                    orderCount: c._count.uuid,
                };
            });

            return {
                newCustomers,
                repeatCustomers: Number(repeatCustomers[0]?.count || 0),
                topCustomers: topCustomersWithDetails,
                avgOrderValue: avgOrderValue._avg.totalAmount || 0,
            };
        });
    }

    static async getSubscriptionInfo(tenantUuid: string) {
        const cacheKey = `dashboard:tenant:${tenantUuid}:subscription`;

        return withCache(cacheKey, 60, async () => {
            const subscription = await prisma.subscription.findFirst({
                where: {
                    tenantUuid,
                    status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
                },
                include: {
                    plan: {
                        include: {
                            features: true,
                            quotas: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            if (!subscription) {
                return null;
            }

            // Get quota usage
            const quotaUsage = await prisma.usageQuota.findMany({
                where: { tenantUuid },
            });

            return {
                subscription: {
                    uuid: subscription.uuid,
                    status: subscription.status,
                    plan: subscription.plan.name,
                    interval: subscription.interval,
                    currentPeriodEnd: subscription.currentPeriodEnd,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                },
                quotas: quotaUsage.map((q) => ({
                    quotaKey: q.quotaKey,
                    quotaName: q.quotaName,
                    used: q.used,
                    limit: q.limit,
                    usagePercent: Math.round((q.used / q.limit) * 100),
                })),
            };
        });
    }
}