import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { withCache } from "../../infrastructure/cache/redis.ts";
 
 
export class RevenueForecastService {
    //CURRENT PERIOD PROJECTION
    //"You're on pace for $X this month based on $Y earned in Z days"
    static async getCurrentPeriodProjection(input: {
        tenantUuid: string;
        storeUuid?: string;
        period?: "month" | "week";
    }) {
        const period = input.period ?? "month";
        const periodStart = dayjs().startOf(period).toDate();
        const periodEnd = dayjs().endOf(period).toDate();
        const now = new Date();
    
        const cacheKey = `forecast:projection:${input.tenantUuid}:${input.storeUuid ?? "all"}:${period}`;
    
        return withCache(cacheKey, 300, async () => {
            const metrics = await prisma.storeDailyMetrics.findMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    ...(input.storeUuid && { storeUuid: input.storeUuid }),
                    date: { gte: periodStart, lte: now },
                },
                select: { date: true, revenueGross: true, ordersCompleted: true },
            });
        
            const totalRevenue = metrics.reduce((s, m) => s + m.revenueGross, 0);
            const totalOrders = metrics.reduce((s, m) => s + m.ordersCompleted, 0);
            const daysElapsed = metrics.length || 1;
        
            // Days remaining in period
            const totalDays =
                period === "month"
                ? dayjs().daysInMonth()
                : 7;
            const daysRemaining = totalDays - daysElapsed;
    
            // Daily pace
            const dailyRevenuePace = Math.round(totalRevenue / daysElapsed);
            const dailyOrderPace = Math.round(totalOrders / daysElapsed);
        
            // Projection
            const projectedRevenue = totalRevenue + dailyRevenuePace * daysRemaining;
            const projectedOrders = totalOrders + dailyOrderPace * daysRemaining;
        
            // Confidence: more days elapsed = higher confidence
            const confidencePercent = Math.round((daysElapsed / totalDays) * 100);
    
            return {
                period: {
                    type: period,
                    start: periodStart,
                    end: periodEnd,
                    totalDays,
                    daysElapsed,
                    daysRemaining,
                },
                actual: {
                    revenue: totalRevenue,
                    orders: totalOrders,
                },
                pace: {
                    dailyRevenue: dailyRevenuePace,
                    dailyOrders: dailyOrderPace,
                },
                projection: {
                    revenue: projectedRevenue,
                    orders: projectedOrders,
                    confidence: confidencePercent,
                },
                percentComplete: Math.round((totalRevenue / (projectedRevenue || 1)) * 100),
            };
        });
    }
 
    //YEAR-OVER-YEAR COMPARISON
    //"This month vs same month last year"
    //"This week vs same week last year"
    static async getYearOverYearComparison(input: {
        tenantUuid: string;
        storeUuid?: string;
        period?: "day" | "week" | "month";
    }) {
        const period = input.period ?? "month";
        const currentStart = dayjs().startOf(period).toDate();
        const currentEnd = new Date();
    
        // Same period last year
        const lastYearStart = dayjs(currentStart).subtract(1, "year").toDate();
        const lastYearEnd = dayjs(currentEnd).subtract(1, "year").toDate();
    
        const cacheKey = `forecast:yoy:${input.tenantUuid}:${input.storeUuid ?? "all"}:${period}`;
    
        return withCache(cacheKey, 600, async () => {
            const storeFilter = input.storeUuid ? { storeUuid: input.storeUuid } : {};
        
            const [currentMetrics, lastYearMetrics] = await Promise.all([
                prisma.storeDailyMetrics.aggregate({
                    where: {
                        tenantUuid: input.tenantUuid,
                        ...storeFilter,
                        date: { gte: currentStart, lte: currentEnd },
                    },
                    _sum: { revenueGross: true, ordersCompleted: true },
                    _count: true,
                }),
                prisma.storeDailyMetrics.aggregate({
                    where: {
                        tenantUuid: input.tenantUuid,
                        ...storeFilter,
                        date: { gte: lastYearStart, lte: lastYearEnd },
                    },
                    _sum: { revenueGross: true, ordersCompleted: true },
                    _count: true,
                }),
            ]);
    
            const currentRevenue = currentMetrics._sum.revenueGross ?? 0;
            const lastYearRevenue = lastYearMetrics._sum.revenueGross ?? 0;
            const currentOrders = currentMetrics._sum.ordersCompleted ?? 0;
            const lastYearOrders = lastYearMetrics._sum.ordersCompleted ?? 0;
        
            const revenueChange = currentRevenue - lastYearRevenue;
            const revenueChangePercent =
                lastYearRevenue > 0
                ? Number(((revenueChange / lastYearRevenue) * 100).toFixed(2))
                : currentRevenue > 0
                    ? 100
                    : 0;
        
            const orderChange = currentOrders - lastYearOrders;
    
            return {
                period: {
                    type: period,
                    current: { from: currentStart, to: currentEnd },
                    lastYear: { from: lastYearStart, to: lastYearEnd },
                },
                current: {
                    revenue: currentRevenue,
                    orders: currentOrders,
                    dataPoints: currentMetrics._count,
                },
                lastYear: {
                    revenue: lastYearRevenue,
                    orders: lastYearOrders,
                    dataPoints: lastYearMetrics._count,
                    hasData: lastYearMetrics._count > 0,
                },
                change: {
                    revenue: revenueChange,
                    revenuePercent: revenueChangePercent,
                    orders: orderChange,
                    direction: revenueChange > 0 ? "UP" : revenueChange < 0 ? "DOWN" : "FLAT",
                },
            };
        });
    }

    //TREND VELOCITY
    //Is revenue accelerating or decelerating?
    //Compares daily pace of last 7 days vs previous 7 days
    static async getTrendVelocity(input: {
        tenantUuid: string;
        storeUuid?: string;
    }) {
        const cacheKey = `forecast:velocity:${input.tenantUuid}:${input.storeUuid ?? "all"}`;
    
        return withCache(cacheKey, 300, async () => {
            const now = dayjs();
            const storeFilter = input.storeUuid ? { storeUuid: input.storeUuid } : {};
        
            // Last 7 days
            const recentStart = now.subtract(7, "day").startOf("day").toDate();
            const recentEnd = now.startOf("day").toDate();
        
            // Previous 7 days (8-14 days ago)
            const prevStart = now.subtract(14, "day").startOf("day").toDate();
            const prevEnd = recentStart;
        
            const [recentMetrics, previousMetrics] = await Promise.all([
                prisma.storeDailyMetrics.findMany({
                    where: {
                        tenantUuid: input.tenantUuid,
                        ...storeFilter,
                        date: { gte: recentStart, lt: recentEnd },
                    },
                    select: { date: true, revenueGross: true, ordersCompleted: true },
                    orderBy: { date: "asc" },
                }),
                prisma.storeDailyMetrics.findMany({
                    where: {
                        tenantUuid: input.tenantUuid,
                        ...storeFilter,
                        date: { gte: prevStart, lt: prevEnd },
                    },
                    select: { revenueGross: true, ordersCompleted: true },
                }),
            ]);
    
            // Aggregate by day for recent period (may have multiple stores)
            const recentByDay = new Map<string, number>();
            for (const m of recentMetrics) {
                const key = dayjs(m.date).format("YYYY-MM-DD");
                recentByDay.set(key, (recentByDay.get(key) ?? 0) + m.revenueGross);
            }
        
            const recentTotal = recentMetrics.reduce((s, m) => s + m.revenueGross, 0);
            const previousTotal = previousMetrics.reduce((s, m) => s + m.revenueGross, 0);
        
            const recentDays = recentByDay.size || 1;
            const previousDays = 7; // Fixed window
        
            const recentDailyAvg = Math.round(recentTotal / recentDays);
            const previousDailyAvg = Math.round(previousTotal / previousDays);
        
            const acceleration = recentDailyAvg - previousDailyAvg;
            const accelerationPercent =
                previousDailyAvg > 0
                ? Number(((acceleration / previousDailyAvg) * 100).toFixed(2))
                : 0;
        
            // Determine trend
            let trend: "ACCELERATING" | "STABLE" | "DECELERATING";
            if (accelerationPercent > 5) trend = "ACCELERATING";
            else if (accelerationPercent < -5) trend = "DECELERATING";
            else trend = "STABLE";
    
            return {
                recent: {
                    period: "last 7 days",
                    totalRevenue: recentTotal,
                    dailyAverage: recentDailyAvg,
                    dailyBreakdown: Array.from(recentByDay.entries()).map(([date, rev]) => ({
                        date,
                        revenue: rev,
                    })),
                },
                previous: {
                    period: "8-14 days ago",
                    totalRevenue: previousTotal,
                    dailyAverage: previousDailyAvg,
                },
                velocity: {
                    acceleration,
                    accelerationPercent,
                    trend,
                    description:
                        trend === "ACCELERATING"
                        ? `Revenue is growing ${accelerationPercent}% faster than the previous week`
                        : trend === "DECELERATING"
                            ? `Revenue has slowed ${Math.abs(accelerationPercent)}% compared to the previous week`
                            : "Revenue pace is steady compared to the previous week",
                },
            };
        });
    }
 
    //FORECAST DASHBOARD CARD
    //Combined summary for the tenant admin dashboard
    static async getForecastSummary(input: {
        tenantUuid: string;
        storeUuid?: string;
    }) {
        const [projection, yoy, velocity] = await Promise.all([
            this.getCurrentPeriodProjection({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                period: "month",
            }),
            this.getYearOverYearComparison({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                period: "month",
            }),
            this.getTrendVelocity({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            }),
        ]);
    
        return {
            monthProjection: {
                actual: projection.actual.revenue,
                projected: projection.projection.revenue,
                confidence: projection.projection.confidence,
                dailyPace: projection.pace.dailyRevenue,
            },
            yearOverYear: {
                currentRevenue: yoy.current.revenue,
                lastYearRevenue: yoy.lastYear.revenue,
                changePercent: yoy.change.revenuePercent,
                direction: yoy.change.direction,
                hasLastYearData: yoy.lastYear.hasData,
            },
            trend: {
                velocity: velocity.velocity.trend,
                accelerationPercent: velocity.velocity.accelerationPercent,
                recentDailyAvg: velocity.recent.dailyAverage,
            },
        };
    }
}