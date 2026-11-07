import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";
import { withCache } from "../../infrastructure/cache/cache.ts";
import { bumpCacheVersion, getCacheVersion } from "../../infrastructure/cache/cacheVersion.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


export class StaffDashboardService {
    //Personal shift dashboard for cashiers and staff
    static async getDashboard(tenantUuid: string, userUuid: string, storeUuid: string) {
        // Versioned per store, so the store's order and payment events can
        // drop every staff member's entry at once (see invalidate)
        const version = await getCacheVersion(`store:${storeUuid}:staff-dashboard`);
        const cacheKey = `staff:${storeUuid}:${userUuid}:dashboard:v${version}`;
    
        return withCache(cacheKey, 30, async () => {
            const timer = MetricsService.startTimer("dashboard_build", { role: "staff" });
            try {
                const todayStart = dayjs().startOf("day").toDate();
        
                // Get tenantUser for this user + tenant
                const tenantUser = await prisma.tenantUser.findFirst({
                    where: { tenantUuid, userUuid, isActive: true },
                    select: { uuid: true, userUuid: true, role: true },
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
                    // Current active time entry (keyed by the User, not the TenantUser)
                    prisma.timeEntry.findFirst({
                        where: {
                            tenantUuid,
                            userUuid: tenantUser.userUuid,
                            storeUuid,
                            clockOutAt: null,
                        },
                        select: {
                            uuid: true,
                            clockInAt: true,
                            breakEntries: {
                                where: { breakEnd: null },
                                select: { uuid: true, breakStart: true, breakType: true },
                            },
                        },
                    }),
        
                    // Orders I took today (Order.tenantUserUuid is the staff member who created it)
                    prisma.order.count({
                        where: {
                            tenantUuid,
                            storeUuid,
                            tenantUserUuid: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                        },
                    }),
            
                    // Revenue from my orders
                    prisma.order.aggregate({
                        where: {
                            tenantUuid,
                            storeUuid,
                            tenantUserUuid: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                            status: "COMPLETED",
                        },
                        _sum: { totalAmount: true },
                    }),
        
                    // My tips today: tips are recorded on the order (Order.tipAmount);
                    // pooled payouts live in TipDistribution and are settled per period
                    prisma.order.aggregate({
                        where: {
                            tenantUuid,
                            storeUuid,
                            tenantUserUuid: tenantUser.uuid,
                            createdAt: { gte: todayStart },
                            status: { not: "CANCELLED" },
                        },
                        _sum: { tipAmount: true },
                    }),
            
                    // My commission (if volume-based 2.5%)
                    prisma.commission.findFirst({
                        where: {
                            tenantUuid,
                            storeUuid,
                            userUuid: tenantUser.userUuid,
                            periodStart: { lte: new Date() },
                            periodEnd: { gte: new Date() },
                        },
                        select: { commissionAmount: true, totalSales: true, commissionRate: true },
                    }),
            
                    // My next 3 scheduled shifts
                    prisma.shift.findMany({
                        where: {
                            tenantUuid,
                            userUuid: tenantUser.userUuid,
                            storeUuid,
                            scheduledStart: { gte: new Date() },
                            status: "SCHEDULED",
                        },
                        select: {
                            uuid: true,
                            scheduledStart: true,
                            scheduledEnd: true,
                            shiftType: true,
                        },
                        orderBy: { scheduledStart: "asc" },
                        take: 3,
                    }),
                
                    // My assigned cash drawer
                    prisma.cashDrawer.findFirst({
                        where: {
                            tenantUuid,
                            storeUuid,
                            userUuid: tenantUser.userUuid,
                            status: "OPEN",
                        },
                        select: {
                            uuid: true,
                            drawerNumber: true,
                            openingBalance: true,
                            // Running cash the system expects in the drawer (kept by the cashier payment flow)
                            expectedCash: true,
                            status: true,
                        },
                    }),
            
                    // My active orders
                    prisma.order.findMany({
                        where: {
                            tenantUuid,
                            storeUuid,
                            tenantUserUuid: tenantUser.uuid,
                            status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
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
        
                const isOnBreak = (currentShift?.breakEntries?.length ?? 0) > 0;
        
                return {
                shift: currentShift
                    ? {
                        timeEntryUuid: currentShift.uuid,
                        clockedInAt: currentShift.clockInAt,
                        hoursWorked: dayjs().diff(dayjs(currentShift.clockInAt), "hour", true).toFixed(1),
                        isOnBreak,
                        currentBreak: isOnBreak
                        ? {
                            breakUuid: currentShift.breakEntries[0].uuid,
                            startedAt: currentShift.breakEntries[0].breakStart,
                            type: currentShift.breakEntries[0].breakType,
                            duration: dayjs().diff(dayjs(currentShift.breakEntries[0].breakStart), "minute"),
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
                        tips: myTips._sum.tipAmount ?? 0,
                        commission: myCommission
                        ? {
                            amount: myCommission.commissionAmount,
                            salesVolume: myCommission.totalSales,
                            rate: myCommission.commissionRate,
                            }
                        : null,
                    },
                    cashDrawer: cashDrawer
                        ? {
                            uuid: cashDrawer.uuid,
                            drawerNumber: cashDrawer.drawerNumber,
                            openingBalance: cashDrawer.openingBalance,
                            currentBalance: cashDrawer.expectedCash,
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
                            date: dayjs(s.scheduledStart).format("YYYY-MM-DD"),
                            start: dayjs(s.scheduledStart).format("HH:mm"),
                            end: dayjs(s.scheduledEnd).format("HH:mm"),
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
    
    // Drops the cached dashboards of all the store's staff
    static async invalidate(storeUuid: string) {
        await bumpCacheVersion(`store:${storeUuid}:staff-dashboard`);
    }
}