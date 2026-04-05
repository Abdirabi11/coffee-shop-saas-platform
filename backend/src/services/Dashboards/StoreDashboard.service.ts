import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../cache/cache.ts";
import { getCacheVersion } from "../../cache/cacheVersion.ts";

export class StoreDashboardService{
    static async getOverview(storeUuid: string) {
        const version = await getCacheVersion(`store:${storeUuid}:dashboard`);
        const cacheKey = `dashboard:store:${storeUuid}:overview:v${version}`;

        return withCache(cacheKey, 60, async () => {
            const todayStart= dayjs().startOf("day").toDate();

            const [
                activeOrders,
                todayRevenue,
                todayOrders,
                avgPrepTime,
                failedPayments,
            ] = await Promise.all([
                prisma.order.count({
                    where: {
                        storeUuid,
                        status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                    },
                }),

                prisma.order.aggregate({
                    where: {
                        storeUuid,
                        status: "COMPLETED",
                        createdAt: { gte: todayStart },
                    },
                    _sum: { totalAmount: true },
                    _count: { uuid: true },
                }),
        
                prisma.order.count({
                    where: {
                        storeUuid,
                        createdAt: { gte: todayStart },
                    },
                }),

                prisma.$queryRaw<{ avg_minutes: number }[]>`
                    SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 60) as avg_minutes
                    FROM "Order"
                    WHERE "storeUuid" = ${storeUuid}
                    AND status = 'COMPLETED'
                    AND "actualReadyAt" >= ${todayStart}
                `,
                    
                prisma.payment.count({
                    where: {
                        storeUuid,
                        status: "FAILED",
                        createdAt: { gte: todayStart },
                    },
                }),
            ])

            return {
                orders: {
                    active: activeOrders,
                    today: todayOrders,
                    completed: todayRevenue._count.uuid,
                },
                revenue: {
                    today: todayRevenue._sum.totalAmount || 0,
                },
                performance: {
                    avgPrepTimeMinutes: avgPrepTime[0]?.avg_minutes || 0,
                    failedPayments,
                },
            };
        })
    }

    static async getActiveOrders(storeUuid: string, input: {
        page?: number;
        limit?: number;
    }) {
        const page = input.page || 1;
        const limit = input.limit || 20;
        const skip = (page - 1) * limit;

        const version = await getCacheVersion(`store:${storeUuid}:active-orders`);
        const cacheKey = `dashboard:store:${storeUuid}:active-orders:p${page}:v${version}`;

        return withCache(cacheKey, 30, async () => {
            const [orders, total] = await Promise.all([
                    prisma.order.findMany({
                    where: {
                        storeUuid,
                        status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                    },
                    include: {
                        items: {
                            include: {
                                product: {
                                    select: { name: true, imageUrls: true },
                                },
                            },
                        },
                        tenantUser: {
                            include: {
                                user: {
                                    select: { name: true, phoneNumber: true },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: "asc" },
                    skip,
                    take: limit,
                }),
        
                prisma.order.count({
                    where: {
                        storeUuid,
                        status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                    },
                }),
            ]);

            return {
                data: orders,
                meta: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            };
        });
    }

    static async getPeakHours(storeUuid: string, input?: {
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const cacheKey = `dashboard:store:${storeUuid}:peak-hours`;

        return withCache(cacheKey, 300, async () => {
            const where: any = { storeUuid };
      
            if (input?.dateFrom && input?.dateTo) {
                where.createdAt = { gte: input.dateFrom, lte: input.dateTo };
            } else {
                // Default: last 30 days
                where.createdAt = { gte: dayjs().subtract(30, "day").toDate() };
            }

            const orders = await prisma.order.findMany({
                where,
                select: { createdAt: true, totalAmount: true },
            });

            const hourlyData = new Map<number, { orders: number; revenue: number }>();

            orders.forEach((order) => {
                const hour = order.createdAt.getHours();
                const current = hourlyData.get(hour) || { orders: 0, revenue: 0 };
                hourlyData.set(hour, {
                    orders: current.orders + 1,
                    revenue: current.revenue + order.totalAmount,
                });
            });

            return Array.from(hourlyData.entries())
                .map(([hour, data]) => ({
                    hour,
                    orders: data.orders,
                    revenue: data.revenue,
                }))
                .sort((a, b) => b.orders - a.orders);
        })
    }

    static async getStaffPerformance(storeUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:store:${storeUuid}:staff:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            // Orders handled by each staff member
            const staffOrders = await prisma.order.groupBy({
                by: ["handledBy"],
                where: {
                    storeUuid,
                    status: "COMPLETED",
                    handledBy: { not: null },
                    createdAt: { gte: input.dateFrom, lte: input.dateTo },
                },
                _count: { uuid: true },
                _sum: { totalAmount: true },
            });

            const staffDetails = await prisma.user.findMany({
                where: { uuid: { in: staffOrders.map((s) => s.handledBy!) } },
                select: { uuid: true, name: true },
            });

            return staffOrders.map((s) => {
                const staff = staffDetails.find((sd) => sd.uuid === s.handledBy);
                return {
                    staffUuid: s.handledBy,
                    staffName: staff?.name || "Unknown",
                    ordersHandled: s._count.uuid,
                    revenue: s._sum.totalAmount || 0,
                };
            }).sort((a, b) => b.ordersHandled - a.ordersHandled);
        });
    }

    static async getProductPerformance(storeUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
        limit?: number;
    }) {
        const cacheKey = `dashboard:store:${storeUuid}:products:${input.dateFrom.toISOString()}`;

        return withCache(cacheKey, 300, async () => {
            const productMetrics = await prisma.productDailyMetrics.groupBy({
                by: ["productUuid"],
                where: {
                    storeUuid,
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
                select: { uuid: true, name: true, basePrice: true },
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
}