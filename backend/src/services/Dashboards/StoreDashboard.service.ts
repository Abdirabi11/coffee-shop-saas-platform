import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../infrastructure/cache/cache.ts";
import { bumpCacheVersion, getCacheVersion } from "../../infrastructure/cache/cacheVersion.ts";
import { DailyReconciliationService } from "../payment/DailyReconciliation.service.ts";
import { collectedRevenue, failedPaymentsIn, ordersCreatedIn, periodWindows } from "./storeRevenue.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

const storeTimezone = async (storeUuid: string) => {
    const store = await prisma.store.findUnique({ where: { uuid: storeUuid }, select: { timezone: true } });
    return DailyReconciliationService.safeTimezone(store?.timezone);
};

// Cache key part for an optional date range
const rangeKey = (from?: Date, to?: Date) => `${from?.toISOString() ?? "-"}:${to?.toISOString() ?? "-"}`;

export class StoreDashboardService{
    // Today is the store's local day. Revenue is the daily reconciliation's:
    // collected (PAID / COMPLETED / PARTIALLY_REFUNDED / REFUNDED, when the
    // money came in) - refunds paid back - provider fees.
    static async getOverview(storeUuid: string) {
        const tz = await storeTimezone(storeUuid);
        const localDate = dayjs().tz(tz).format("YYYY-MM-DD");
        const version = await getCacheVersion(`store:${storeUuid}:dashboard`);
        const cacheKey = `dashboard:store:${storeUuid}:overview:${localDate}:v${version}`;

        return withCache(cacheKey, 60, async () => {
            const today = periodWindows([{ uuid: storeUuid, timezone: tz }], "today").current;
            const { gte: todayStart, lt: now } = today[0];

            const [
                activeOrders,
                revenue,
                completedToday,
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

                collectedRevenue(today),

                prisma.order.count({
                    where: { status: "COMPLETED", ...ordersCreatedIn(today) },
                }),
        
                prisma.order.count({ where: ordersCreatedIn(today) }),

                // Bounds as UTC wall time: the columns are zone-less UTC
                prisma.$queryRaw<{ avg_minutes: number | null }[]>`
                    SELECT AVG(EXTRACT(EPOCH FROM ("actualReadyAt" - "createdAt")) / 60)::float8 as avg_minutes
                    FROM "Order"
                    WHERE "storeUuid" = ${storeUuid}
                    AND status = 'COMPLETED'
                    AND "actualReadyAt" >= ${todayStart.toISOString()}::timestamp
                    AND "actualReadyAt" < ${now.toISOString()}::timestamp
                `,
                    
                prisma.payment.count({ where: failedPaymentsIn(today) }),
            ])

            return {
                date: localDate,
                timezone: tz,
                orders: {
                    active: activeOrders,
                    today: todayOrders,
                    completed: completedToday,
                },
                revenue: {
                    today: revenue.net,
                    gross: revenue.gross,
                    refunds: revenue.refunds,
                    providerFees: revenue.providerFees,
                    payments: revenue.payments,
                },
                performance: {
                    avgPrepTimeMinutes: avgPrepTime[0]?.avg_minutes || 0,
                    failedPayments,
                },
            };
        })
    }

    // Drops the store's cached overview and active orders
    static async invalidate(storeUuid: string) {
        await Promise.all([
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:active-orders`),
        ]);
    }

    static async getDashboard(tenantUuid: string, storeUuid: string) {
        const store = await prisma.store.findFirst({
            where: { uuid: storeUuid, tenantUuid, active: true },
            select: { uuid: true, name: true, city: true, currency: true },
        });

        if (!store) {
            throw new Error("STORE_NOT_FOUND");
        }

        const [overview, activeOrders, peakHours] = await Promise.all([
            StoreDashboardService.getOverview(storeUuid),
            StoreDashboardService.getActiveOrders(storeUuid, { limit: 10 }),
            StoreDashboardService.getPeakHours(storeUuid),
        ]);

        return {
            store,
            ...overview,
            activeOrders: activeOrders.data,
            peakHours: peakHours.slice(0, 5),
            generatedAt: new Date().toISOString(),
        };
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
        const ranged = input?.dateFrom && input?.dateTo;
        // The default range moves daily
        const cacheKey = `dashboard:store:${storeUuid}:peak-hours:${ranged ? rangeKey(input.dateFrom, input.dateTo) : dayjs().format("YYYY-MM-DD")}`;

        return withCache(cacheKey, 300, async () => {
            const tz = await storeTimezone(storeUuid);
            // Default: last 30 days
            const from = ranged ? input.dateFrom! : dayjs().subtract(30, "day").toDate();
            const to = ranged ? input.dateTo! : new Date();

            // Hours on the store's clock; grouped in the database. Bounds as
            // UTC wall time: the columns are zone-less UTC.
            const rows = await prisma.$queryRaw<{ hour: number; orders: number; revenue: bigint }[]>`
                SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour,
                       COUNT(*)::int AS orders,
                       SUM("totalAmount")::bigint AS revenue
                FROM "Order"
                WHERE "storeUuid" = ${storeUuid}
                  AND "createdAt" >= ${from.toISOString()}::timestamp
                  AND "createdAt" <= ${to.toISOString()}::timestamp
                GROUP BY 1
            `;

            return rows
                .map((r) => ({ hour: r.hour, orders: r.orders, revenue: Number(r.revenue) }))
                .sort((a, b) => b.orders - a.orders);
        })
    }

    static async getStaffPerformance(storeUuid: string, input: {
        dateFrom: Date;
        dateTo: Date;
    }) {
        const cacheKey = `dashboard:store:${storeUuid}:staff:${rangeKey(input.dateFrom, input.dateTo)}`;

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
        const cacheKey = `dashboard:store:${storeUuid}:products:${rangeKey(input.dateFrom, input.dateTo)}:${input.limit || 10}`;

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