import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { withCache } from "../../cache/cache.ts";


export class PerformanceTrackingService {
  
    static async calculateDailyPerformance(input: {
        userUuid: string;
        storeUuid: string;
        date: Date;
    }) {
        try {
            const startOfDay = dayjs(input.date).startOf("day").toDate();
            const endOfDay = dayjs(input.date).endOf("day").toDate();

            // Get orders taken by this staff member
            const orders = await prisma.order.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    createdBy: input.userUuid,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            const ordersCount = orders.length;
            const ordersCancelled = orders.filter((o) => o.status === "CANCELLED").length;
            const totalRevenue = orders
                .filter((o) => o.status === "COMPLETED")
                .reduce((sum, o) => sum + o.totalAmount, 0);
            const avgOrderValue = ordersCount > 0 ? Math.round(totalRevenue / ordersCount) : 0;

            // Count upsells (items added beyond base order)
            const upsellsCount = 0; // TODO: Implement upsell logic

            // Get time entry for hours worked
            const timeEntries = await prisma.timeEntry.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    clockInAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            const hoursWorked = timeEntries.reduce((sum, te) => sum + (te.hoursWorked || 0), 0);

            // Check for late arrivals
            const shifts = await prisma.shift.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    scheduledStart: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                include: { timeEntry: true },
            });

            let lateArrivals = 0;
            shifts.forEach((shift) => {
                if (shift.timeEntry) {
                    const scheduledStart = dayjs(shift.scheduledStart);
                    const actualStart = dayjs(shift.timeEntry.clockInAt);
                    if (actualStart.diff(scheduledStart, "minute") > 5) {
                        lateArrivals++;
                    }
                }
            });

            const missedShifts = shifts.filter((s) => s.status === "NO_SHOW").length;

            // Get refunds and voids
            const refundsGiven = await prisma.payment.count({
                where: {
                    storeUuid: input.storeUuid,
                    status: "REFUNDED",
                    refundedBy: input.userUuid,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            const voidsCreated = await prisma.order.count({
                where: {
                    storeUuid: input.storeUuid,
                    status: "VOID",
                    voidedBy: input.userUuid,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Get cash drawer variance
            const cashDrawers = await prisma.cashDrawer.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    openedAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            const cashVariance = cashDrawers.reduce((sum, d) => sum + (d.variance || 0), 0);
            const cashShortages = cashDrawers.filter((d) => (d.variance || 0) < 0).length;
            const cashOverages = cashDrawers.filter((d) => (d.variance || 0) > 0).length;

            // Calculate performance score (0-100)
            let performanceScore = 100;
            performanceScore -= lateArrivals * 5;
            performanceScore -= missedShifts * 20;
            performanceScore -= refundsGiven * 2;
            performanceScore -= voidsCreated * 3;
            performanceScore -= cashShortages * 10;
            performanceScore = Math.max(0, Math.min(100, performanceScore));

            // Get tenant UUID
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            if (!userStore) {
                throw new Error("USER_STORE_NOT_FOUND");
            };

            // Store performance record
            const performance = await prisma.staffPerformance.upsert({
                where: {
                    userUuid_storeUuid_periodStart_periodType: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                        periodStart: startOfDay,
                        periodType: "DAILY",
                    },
                },
                create: {
                    tenantUuid: userStore.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                    periodStart: startOfDay,
                    periodEnd: endOfDay,
                    periodType: "DAILY",
                    ordersCount,
                    ordersCancelled,
                    totalRevenue,
                    avgOrderValue,
                    upsellsCount,
                    hoursWorked,
                    lateArrivals,
                    missedShifts,
                    refundsGiven,
                    voidsCreated,
                    cashVariance,
                    cashShortages,
                    cashOverages,
                    performanceScore,
                },
                update: {
                    ordersCount,
                    ordersCancelled,
                    totalRevenue,
                    avgOrderValue,
                    upsellsCount,
                    hoursWorked,
                    lateArrivals,
                    missedShifts,
                    refundsGiven,
                    voidsCreated,
                    cashVariance,
                    cashShortages,
                    cashOverages,
                    performanceScore,
                },
            });

            logWithContext("info", "[Performance] Daily performance calculated", {
                userUuid: input.userUuid,
                date: input.date,
                performanceScore,
            });

            return performance;

        } catch (error: any) {
            logWithContext("error", "[Performance] Failed to calculate performance", {
                error: error.message,
            });
            throw error;
        }
    }

    //Get performance metrics for user
    static async getUserPerformance(input: {
        userUuid: string;
        storeUuid: string;
        periodType: string;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const cacheKey = `performance:user:${input.userUuid}:${input.periodType}`;

        return withCache(cacheKey, 600, async () => {
            const where: any = {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                periodType: input.periodType,
            };

            if (input.dateFrom || input.dateTo) {
                where.periodStart = {};
                if (input.dateFrom) where.periodStart.gte = input.dateFrom;
                if (input.dateTo) where.periodStart.lte = input.dateTo;
            }

            const records = await prisma.staffPerformance.findMany({
                where,
                orderBy: { periodStart: "desc" },
            });

            // Calculate aggregates
            const totals = records.reduce(
                (acc, r) => ({
                    ordersCount: acc.ordersCount + r.ordersCount,
                    totalRevenue: acc.totalRevenue + r.totalRevenue,
                    hoursWorked: acc.hoursWorked + r.hoursWorked,
                    lateArrivals: acc.lateArrivals + r.lateArrivals,
                    missedShifts: acc.missedShifts + r.missedShifts,
                }),
                {
                    ordersCount: 0,
                    totalRevenue: 0,
                    hoursWorked: 0,
                    lateArrivals: 0,
                    missedShifts: 0,
                }
            );

            const avgPerformanceScore =
                records.length > 0
                ? records.reduce((sum, r) => sum + (r.performanceScore || 0), 0) / records.length
                : 0;

            return {
                records,
                totals,
                avgPerformanceScore: Number(avgPerformanceScore.toFixed(2)),
            };
        });
    }

    static async getLeaderboard(input: {
        storeUuid: string;
        periodType: string;
        metric: string;
        limit?: number;
    }) {
        const limit = input.limit || 10;

        // Get latest period
        const latestPeriod = await prisma.staffPerformance.findFirst({
            where: {
                storeUuid: input.storeUuid,
                periodType: input.periodType,
            },
            orderBy: { periodStart: "desc" },
        });

        if (!latestPeriod) {
            return [];
        }

        const orderBy: any = {};
        orderBy[input.metric] = "desc";

        const leaderboard = await prisma.staffPerformance.findMany({
            where: {
                storeUuid: input.storeUuid,
                periodType: input.periodType,
                periodStart: latestPeriod.periodStart,
            },
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                        profilePhoto: true,
                    },
                },
            },
            orderBy,
            take: limit,
        });

        return leaderboard.map((entry, index) => ({
            rank: index + 1,
            user: entry.user,
            metric: input.metric,
            value: (entry as any)[input.metric],
            performanceScore: entry.performanceScore,
        }));
    }

    static async comparePerformance(input: {
        userUuids: string[];
        storeUuid: string;
        periodStart: Date;
        periodEnd: Date;
    }){
        const performances = await prisma.staffPerformance.findMany({
            where: {
                userUuid: { in: input.userUuids },
                storeUuid: input.storeUuid,
                periodStart: { gte: input.periodStart },
                periodEnd: { lte: input.periodEnd },
            },
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        // Group by user
        const grouped = new Map<string, any>();

        performances.forEach((p) => {
            if (!grouped.has(p.userUuid)) {
                grouped.set(p.userUuid, {
                    user: p.user,
                    totals: {
                        ordersCount: 0,
                        totalRevenue: 0,
                        hoursWorked: 0,
                        lateArrivals: 0,
                        performanceScore: [],
                    },
                });
            }

            const data = grouped.get(p.userUuid)!;
            data.totals.ordersCount += p.ordersCount;
            data.totals.totalRevenue += p.totalRevenue;
            data.totals.hoursWorked += p.hoursWorked;
            data.totals.lateArrivals += p.lateArrivals;
            data.totals.performanceScore.push(p.performanceScore || 0);
        });

        // Calculate averages
        const comparison = Array.from(grouped.entries()).map(([userUuid, data]) => ({
            userUuid,
            user: data.user,
            totals: {
                ...data.totals,
                avgPerformanceScore:
                data.totals.performanceScore.reduce((a: number, b: number) => a + b, 0) /
                data.totals.performanceScore.length,
            },
        }));

        return comparison;
    }
}