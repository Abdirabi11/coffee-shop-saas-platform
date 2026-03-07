import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { EventBus } from "../../events/eventBus.ts";

export class LaborCostTrackingService {
  
    //Create or update labor budget
    static async setLaborBudget(input: {
        tenantUuid: string;
        storeUuid: string;
        targetLaborPercent: number;
        maxLaborPercent: number;
        dayTargets?: {
            monday?: number;
            tuesday?: number;
            wednesday?: number;
            thursday?: number;
            friday?: number;
            saturday?: number;
            sunday?: number;
        };
    }) {
        // Deactivate old budget
        await prisma.laborBudget.updateMany({
            where: {
                storeUuid: input.storeUuid,
                isActive: true,
            },
            data: {
                isActive: false,
                effectiveUntil: new Date(),
            },
        });

        // Create new budget
        const budget = await prisma.laborBudget.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                targetLaborPercent: input.targetLaborPercent,
                maxLaborPercent: input.maxLaborPercent,
                mondayTarget: input.dayTargets?.monday,
                tuesdayTarget: input.dayTargets?.tuesday,
                wednesdayTarget: input.dayTargets?.wednesday,
                thursdayTarget: input.dayTargets?.thursday,
                fridayTarget: input.dayTargets?.friday,
                saturdayTarget: input.dayTargets?.saturday,
                sundayTarget: input.dayTargets?.sunday,
                isActive: true,
                effectiveFrom: new Date(),
            },
        });

        logWithContext("info", "[LaborCost] Budget set", {
            budgetUuid: budget.uuid,
            targetPercent: input.targetLaborPercent,
        });

        return budget;
    }

    //Calculate labor cost snapshot (real-time)
    static async calculateSnapshot(input: {
        storeUuid: string;
        snapshotDate?: Date;
        periodType?: string;
    }) {
        try {
            const snapshotDate = input.snapshotDate || new Date();
            const periodType = (input.periodType as any) || "HOURLY";

            // Get store info
            const store = await prisma.store.findUnique({
                where: { uuid: input.storeUuid },
            });

            if (!store) throw new Error("STORE_NOT_FOUND");

            // Determine time range based on period type
            let periodStart: Date;
            let periodEnd: Date;

            switch (periodType) {
                case "HOURLY":
                    periodStart = dayjs(snapshotDate).startOf("hour").toDate();
                    periodEnd = dayjs(snapshotDate).endOf("hour").toDate();
                    break;
                case "DAILY":
                    periodStart = dayjs(snapshotDate).startOf("day").toDate();
                    periodEnd = dayjs(snapshotDate).endOf("day").toDate();
                    break;
                case "WEEKLY":
                    periodStart = dayjs(snapshotDate).startOf("week").toDate();
                    periodEnd = dayjs(snapshotDate).endOf("week").toDate();
                    break;
                default:
                    periodStart = dayjs(snapshotDate).startOf("hour").toDate();
                    periodEnd = dayjs(snapshotDate).endOf("hour").toDate();
            }

            // Get scheduled staff
            const scheduledShifts = await prisma.shift.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    scheduledStart: {
                        gte: periodStart,
                        lte: periodEnd,
                    },
                    status: { in: ["SCHEDULED", "IN_PROGRESS"] },
                },
            });

            // Get clocked-in staff
            const activeEntries = await prisma.timeEntry.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    clockInAt: { lte: periodEnd },
                    OR: [
                        { clockOutAt: null },
                        { clockOutAt: { gte: periodStart } },
                    ],
                },
            });

            // Calculate labor hours and cost
            let totalLaborHours = 0;
            let laborCost = 0;

            for (const entry of activeEntries) {
                const entryStart = dayjs(entry.clockInAt);
                const entryEnd = entry.clockOutAt ? dayjs(entry.clockOutAt) : dayjs();

                // Calculate overlap with period
                const overlapStart = entryStart.isAfter(periodStart) ? entryStart : dayjs(periodStart);
                const overlapEnd = entryEnd.isBefore(periodEnd) ? entryEnd : dayjs(periodEnd);

                const hoursInPeriod = overlapEnd.diff(overlapStart, "hour", true);

                if (hoursInPeriod > 0) {
                    totalLaborHours += hoursInPeriod;
                    laborCost += Math.round(hoursInPeriod * (entry.payRate || 0));
                }
            }

            // Get sales for this period
            const orders = await prisma.order.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    createdAt: {
                        gte: periodStart,
                        lte: periodEnd,
                    },
                    status: { in: ["COMPLETED", "PAID"] },
                },
            });

            const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
            const orderCount = orders.length;

            // Calculate metrics
            const laborCostPercent = totalSales > 0 ? (laborCost / totalSales) * 100 : 0;
            const salesPerLaborHour = totalLaborHours > 0 ? Math.round(totalSales / totalLaborHours) : 0;

            // Get labor budget
            const budget = await prisma.laborBudget.findFirst({
                where: {
                    storeUuid: input.storeUuid,
                    isActive: true,
                },
            });

            // Determine target for this day
            let targetPercent = budget?.targetLaborPercent || 30;
            const dayOfWeek = dayjs(snapshotDate).format("dddd").toLowerCase();
            const dayTarget = budget?.[`${dayOfWeek}Target` as keyof typeof budget] as number | undefined;
            if (dayTarget) targetPercent = dayTarget;

            const isOverBudget = laborCostPercent > (budget?.maxLaborPercent || 35);
            const budgetVariance = laborCostPercent - targetPercent;

            // Create snapshot
            const snapshot = await prisma.laborCostSnapshot.upsert({
                where: {
                    storeUuid_snapshotDate_periodType: {
                        storeUuid: input.storeUuid,
                        snapshotDate,
                        periodType,
                    },
                },
                create: {
                    tenantUuid: store.tenantUuid,
                    storeUuid: input.storeUuid,
                    snapshotDate,
                    periodType,
                    scheduledStaff: scheduledShifts.length,
                    clockedInStaff: activeEntries.length,
                    totalLaborHours,
                    laborCost,
                    totalSales,
                    orderCount,
                    laborCostPercent: Number(laborCostPercent.toFixed(2)),
                    salesPerLaborHour,
                    isOverBudget,
                    budgetVariance: Number(budgetVariance.toFixed(2)),
                },
                update: {
                    scheduledStaff: scheduledShifts.length,
                    clockedInStaff: activeEntries.length,
                    totalLaborHours,
                    laborCost,
                    totalSales,
                    orderCount,
                    laborCostPercent: Number(laborCostPercent.toFixed(2)),
                    salesPerLaborHour,
                    isOverBudget,
                    budgetVariance: Number(budgetVariance.toFixed(2)),
                },
            });

            // Emit alert if over budget
            if (isOverBudget) {
                EventBus.emit("LABOR_COST_OVER_BUDGET", {
                    snapshotUuid: snapshot.uuid,
                    storeUuid: input.storeUuid,
                    laborCostPercent,
                    budgetVariance,
                });

                logWithContext("warn", "[LaborCost] Over budget", {
                    storeUuid: input.storeUuid,
                    laborCostPercent,
                    targetPercent,
                });
            }

            MetricsService.gauge("labor_cost.percent", laborCostPercent, {
                storeUuid: input.storeUuid,
            });

            MetricsService.gauge("labor_cost.sales_per_hour", salesPerLaborHour, {
                storeUuid: input.storeUuid,
            });

            return snapshot;

        } catch (error: any) {
            logWithContext("error", "[LaborCost] Snapshot calculation failed", {
                error: error.message,
            });
            throw error;
        }
    }

    static async getLaborCostTrends(input: {
        storeUuid: string;
        dateFrom: Date;
        dateTo: Date;
        periodType?: string;
    }) {
        const periodType = input.periodType || "DAILY";

        const snapshots = await prisma.laborCostSnapshot.findMany({
            where: {
                storeUuid: input.storeUuid,
                periodType: periodType as any,
                snapshotDate: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
            },
            orderBy: { snapshotDate: "asc" },
        });

        // Calculate averages
        const avgLaborPercent =
            snapshots.length > 0
                ? snapshots.reduce((sum, s) => sum + s.laborCostPercent, 0) / snapshots.length
                : 0;

        const avgSalesPerHour =
            snapshots.length > 0
                ? snapshots.reduce((sum, s) => sum + s.salesPerLaborHour, 0) / snapshots.length
                : 0;

        const overBudgetCount = snapshots.filter((s) => s.isOverBudget).length;

        return {
            snapshots,
            summary: {
                avgLaborPercent: Number(avgLaborPercent.toFixed(2)),
                avgSalesPerHour: Math.round(avgSalesPerHour),
                overBudgetCount,
                overBudgetPercent:
                snapshots.length > 0
                    ? Number(((overBudgetCount / snapshots.length) * 100).toFixed(2))
                    : 0,
            },
        };
    }

    //Get real-time labor cost dashboard
    static async getLaborDashboard(input: {
        storeUuid: string;
    }) {
        const now = new Date();

        // Today's snapshot
        const todaySnapshot = await this.calculateSnapshot({
            storeUuid: input.storeUuid,
            snapshotDate: now,
            periodType: "DAILY",
        });

        // Current hour snapshot
        const hourSnapshot = await this.calculateSnapshot({
            storeUuid: input.storeUuid,
            snapshotDate: now,
            periodType: "HOURLY",
        });

        // Week-to-date
        const weekStart = dayjs().startOf("week").toDate();
        const weekSnapshot = await this.calculateSnapshot({
            storeUuid: input.storeUuid,
            snapshotDate: now,
            periodType: "WEEKLY",
        });

        // Currently clocked in staff
        const activeStaff = await prisma.timeEntry.findMany({
            where: {
                storeUuid: input.storeUuid,
                clockOutAt: null,
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

        // Labor budget
        const budget = await prisma.laborBudget.findFirst({
            where: {
                storeUuid: input.storeUuid,
                isActive: true,
            },
        });

        return {
            today: todaySnapshot,
            currentHour: hourSnapshot,
            weekToDate: weekSnapshot,
            activeStaff: activeStaff.map((entry) => ({
                uuid: entry.userUuid,
                name: `${entry.user.firstName} ${entry.user.lastName}`,
                clockedInAt: entry.clockInAt,
                hoursWorked: entry.hoursWorked || 0,
                payRate: entry.payRate,
            })),
            budget,
        };
    }
}