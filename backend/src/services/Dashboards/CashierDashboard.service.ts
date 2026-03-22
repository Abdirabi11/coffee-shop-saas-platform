import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";
import { withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";


export class StaffDashboardService {
    //Personal shift dashboard for cashiers and staff
    static async getDashboard(tenantUuid: string, userUuid: string, storeUuid: string) {
        const cacheKey = `staff:${userUuid}:${storeUuid}:dashboard`;
    
        return withCache(cacheKey, 30, async () => {
            const timer = MetricsService.startTimer("dashboard_build", { role: "staff" });
            try {
                const todayStart = dayjs().startOf("day").toDate();
        
                // Get tenantUser for this user + tenant
                const tenantUser = await prisma.tenantUser.findFirst({
                    where: { tenantUuid, userUuid, isActive: true },
                    select: { uuid: true, role: true },
                });
        
                if (!tenantUser) {
                    throw new Error("STAFF_NOT_FOUND");
                }
        
                const [
                    currentShift,
                    myOrdersToday,
                    myRevenueToday,
                    myTips,
                    myCommission,
                    upcomingShifts,
                    cashDrawer,
                    activeOrders,
                ] = await Promise.all([
                    // Current active time entry
                    prisma.timeEntry.findFirst({
                        where: {
                            tenantUserUuid: tenantUser.uuid,
                            storeUuid,
                            clockOut: null,
                        },
                        select: {
                            uuid: true,
                            clockIn: true,
                            breaks: {
                                where: { endTime: null },
                                select: { uuid: true, startTime: true, breakType: true },
                            },
                        },
                    }),
        
                    // Orders I processed today
                    prisma.order.count({
                        where: {
                            storeUuid,
                            processedBy: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                        },
                    }),
            
                    // Revenue from my orders
                    prisma.order.aggregate({
                        where: {
                            storeUuid,
                            processedBy: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                            status: "COMPLETED",
                        },
                        _sum: { totalAmount: true },
                    }),
        
                    // My tips today
                    prisma.tip.aggregate({
                        where: {
                            recipientUuid: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                        },
                        _sum: { amount: true },
                    }),
            
                    // My commission (if volume-based 2.5%)
                    prisma.commission.findFirst({
                        where: {
                            tenantUserUuid: tenantUser.uuid,
                            periodStart: { lte: new Date() },
                            periodEnd: { gte: new Date() },
                        },
                        select: { amount: true, salesVolume: true, rate: true },
                    }),
            
                    // My next 3 scheduled shifts
                    prisma.shift.findMany({
                        where: {
                            tenantUserUuid: tenantUser.uuid,
                            storeUuid,
                            startTime: { gte: new Date() },
                            status: "SCHEDULED",
                        },
                        select: {
                            uuid: true,
                            startTime: true,
                            endTime: true,
                            shiftType: true,
                        },
                        orderBy: { startTime: "asc" },
                        take: 3,
                    }),
                
                    // My assigned cash drawer
                    prisma.cashDrawer.findFirst({
                        where: {
                            storeUuid,
                            assignedToUuid: tenantUser.uuid,
                            status: { in: ["OPEN", "ACTIVE"] },
                        },
                        select: {
                            uuid: true,
                            drawerNumber: true,
                            openingBalance: true,
                            currentBalance: true,
                            status: true,
                        },
                    }),
            
                    // My active orders
                    prisma.order.findMany({
                        where: {
                            storeUuid,
                            processedBy: tenantUser.uuid,
                            status: { in: ["PENDING", "IN_PROGRESS", "PREPARING"] },
                        },
                        select: {
                            uuid: true,
                            orderNumber: true,
                            status: true,
                            totalAmount: true,
                            createdAt: true,
                        },
                        orderBy: { createdAt: "asc" },
                        take: 10,
                    }),
                ]);
        
                const isOnBreak = (currentShift?.breaks?.length ?? 0) > 0;
        
                return {
                shift: currentShift
                    ? {
                        timeEntryUuid: currentShift.uuid,
                        clockedInAt: currentShift.clockIn,
                        hoursWorked: dayjs().diff(dayjs(currentShift.clockIn), "hour", true).toFixed(1),
                        isOnBreak,
                        currentBreak: isOnBreak
                        ? {
                            breakUuid: currentShift.breaks[0].uuid,
                            startedAt: currentShift.breaks[0].startTime,
                            type: currentShift.breaks[0].breakType,
                            duration: dayjs().diff(dayjs(currentShift.breaks[0].startTime), "minute"),
                            }
                        : null,
                        status: isOnBreak ? "ON_BREAK" : "WORKING",
                    }
                    : null,
                    isClockedIn: !!currentShift,
                    performance: {
                        ordersToday: myOrdersToday,
                        revenueToday: myRevenueToday._sum.totalAmount ?? 0,
                    },
                    earnings: {
                        tips: myTips._sum.amount ?? 0,
                        commission: myCommission
                        ? {
                            amount: myCommission.amount,
                            salesVolume: myCommission.salesVolume,
                            rate: myCommission.rate,
                            }
                        : null,
                    },
                    cashDrawer: cashDrawer
                        ? {
                            uuid: cashDrawer.uuid,
                            drawerNumber: cashDrawer.drawerNumber,
                            openingBalance: cashDrawer.openingBalance,
                            currentBalance: cashDrawer.currentBalance,
                            status: cashDrawer.status,
                        }
                        : null,
                    activeOrders: activeOrders.map((o) => ({
                        ...o,
                        waitTime: dayjs().diff(dayjs(o.createdAt), "minute"),
                    })),
                        schedule: {
                            upcoming: upcomingShifts.map((s) => ({
                            uuid: s.uuid,
                            date: dayjs(s.startTime).format("YYYY-MM-DD"),
                            start: dayjs(s.startTime).format("HH:mm"),
                            end: dayjs(s.endTime).format("HH:mm"),
                            type: s.shiftType,
                        })),
                    },
                    quickActions: {
                        canClockIn: !currentShift,
                        canClockOut: !!currentShift && !isOnBreak,
                        canStartBreak: !!currentShift && !isOnBreak,
                        canEndBreak: !!currentShift && isOnBreak,
                    },
                    generatedAt: new Date().toISOString(),
                };
            } finally {
                timer.end();
            }
        });
    }
    
    static async invalidate(userUuid: string, storeUuid: string) {
        const cacheKey = `staff:${userUuid}:${storeUuid}:dashboard`;
        await invalidateCacheVersion(cacheKey);
    }
}