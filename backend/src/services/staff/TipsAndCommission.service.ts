import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { EventBus } from "../../events/eventBus.ts";

export class TipsAndCommissionService {
    
    static async recordTip(input: {
        orderUuid: string;
        tipAmount: number; // Cents
        tipMethod: string;
    }) {
        const order = await prisma.order.update({
        where: { uuid: input.orderUuid },
            data: {
                tipAmount: input.tipAmount,
                tipMethod: input.tipMethod as any,
            },
        });

        logWithContext("info", "[Tips] Tip recorded", {
            orderUuid: input.orderUuid,
            tipAmount: input.tipAmount,
        });

        MetricsService.increment("tips.recorded", 1);
        MetricsService.histogram("tips.amount", input.tipAmount);

        return order;
    }

    static async calculateTipPool(input: {
        storeUuid: string;
        periodStart: Date;
        periodEnd: Date;
        periodType?: string;
    }) {
        try {
            const periodType = (input.periodType as any) || "DAILY";

            // Get or create tip pool
            let tipPool = await prisma.tipPool.findUnique({
                where: {
                    storeUuid_periodStart_periodType: {
                        storeUuid: input.storeUuid,
                        periodStart: input.periodStart,
                        periodType,
                    },
                },
            });

            if (!tipPool) {
                const store = await prisma.store.findUnique({
                    where: { uuid: input.storeUuid },
                });

                tipPool = await prisma.tipPool.create({
                    data: {
                        tenantUuid: store!.tenantUuid,
                        storeUuid: input.storeUuid,
                        periodStart: input.periodStart,
                        periodEnd: input.periodEnd,
                        periodType,
                        status: "OPEN",
                    },
                });
            };

            // Get all tips for this period
            const orders = await prisma.order.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    createdAt: {
                        gte: input.periodStart,
                        lte: input.periodEnd,
                    },
                    tipAmount: { gt: 0 },
                },
            });

            const totalTips = orders.reduce((sum, o) => sum + (o.tipAmount || 0), 0);
            const totalOrders = orders.length;

            // Get all staff who worked during this period
            const timeEntries = await prisma.timeEntry.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    clockInAt: {
                        gte: input.periodStart,
                        lte: input.periodEnd,
                    },
                    clockOutAt: { not: null },
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

            // Group by user and calculate hours
            const staffHours = new Map<string, { hours: number; orders: number }>();

            timeEntries.forEach((entry) => {
                if (!staffHours.has(entry.userUuid)) {
                    staffHours.set(entry.userUuid, { hours: 0, orders: 0 });
                }
                const current = staffHours.get(entry.userUuid)!;
                current.hours += entry.hoursWorked || 0;
            });

            // Count orders served by each staff
            orders.forEach((order) => {
                if (order.servedBy && staffHours.has(order.servedBy)) {
                    staffHours.get(order.servedBy)!.orders++;
                }
            });

            const totalHoursWorked = Array.from(staffHours.values()).reduce(
                (sum, s) => sum + s.hours,
                0
            );

            // Update tip pool
            await prisma.tipPool.update({
                where: { uuid: tipPool.uuid },
                data: {
                    totalTips,
                    totalOrders,
                    totalHoursWorked,
                    status: "CALCULATED",
                    calculatedAt: new Date(),
                },
            });

            // Create distributions (equal split)
            const staffCount = staffHours.size;
            const tipPerPerson = staffCount > 0 ? Math.floor(totalTips / staffCount) : 0;

            for (const [userUuid, data] of staffHours.entries()) {
                await prisma.tipDistribution.create({
                    data: {
                        tipPoolUuid: tipPool.uuid,
                        userUuid,
                        storeUuid: input.storeUuid,
                        hoursWorked: data.hours,
                        ordersServed: data.orders,
                        tipAmount: tipPerPerson,
                        payoutStatus: "PENDING",
                    },
                });
            };

            logWithContext("info", "[Tips] Pool calculated", {
                tipPoolUuid: tipPool.uuid,
                totalTips,
                staffCount,
                tipPerPerson,
            });

            MetricsService.increment("tips.pool.calculated", 1);

            EventBus.emit("TIP_POOL_CALCULATED", {
                tipPoolUuid: tipPool.uuid,
                storeUuid: input.storeUuid,
                totalTips,
                staffCount,
            });

            return tipPool;

        } catch (error: any) {
            logWithContext("error", "[Tips] Failed to calculate pool", {
                error: error.message,
            });
            throw error;
        }
    }

    static async distributeTips(input: {
        tipPoolUuid: string;
        distributedBy: string;
        paymentMethod: string;
    }) {
        // Update all distributions to PAID
        await prisma.tipDistribution.updateMany({
            where: {
                tipPoolUuid: input.tipPoolUuid,
                payoutStatus: "PENDING",
            },
            data: {
                payoutStatus: "PAID",
                paidAt: new Date(),
                paidBy: input.distributedBy,
                paymentMethod: input.paymentMethod,
            },
        });

        // Update pool status
        const tipPool = await prisma.tipPool.update({
            where: { uuid: input.tipPoolUuid },
            data: {
                status: "DISTRIBUTED",
                distributedAt: new Date(),
                distributedBy: input.distributedBy,
            },
        });

        logWithContext("info", "[Tips] Tips distributed", {
            tipPoolUuid: input.tipPoolUuid,
            distributedBy: input.distributedBy,
        });

        MetricsService.increment("tips.distributed", 1);

        return tipPool;
    }

    static async calculateCommission(input: {
        userUuid: string;
        storeUuid: string;
        periodStart: Date;
        periodEnd: Date;
        periodType?: string;
        commissionRate: number; // Percentage (e.g., 2.5)
        salesTarget?: number; // Optional target for bonus
    }) {
        try {
            const periodType = (input.periodType as any) || "MONTHLY";

            // Get all orders by this staff during period
            const orders = await prisma.order.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    takenBy: input.userUuid,
                    status: "COMPLETED",
                    createdAt: {
                        gte: input.periodStart,
                        lte: input.periodEnd,
                    },
                },
            });

            const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
            const commissionableAmount = totalSales; // All sales are commissionable

            // Calculate commission
            const commissionAmount = Math.round(
                (commissionableAmount * input.commissionRate) / 100
            );

            // Check if target met
            const targetMet = input.salesTarget
                ? totalSales >= input.salesTarget
                : false;

            // Bonus if target met (10% of commission)
            const bonusAmount = targetMet ? Math.round(commissionAmount * 0.1) : 0;

            // Get tenant UUID
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            // Create or update commission record
            const commission = await prisma.commission.upsert({
                where: {
                    userUuid_storeUuid_periodStart_periodType: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                        periodStart: input.periodStart,
                        periodType,
                    },
                },
                create: {
                    tenantUuid: userStore!.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                    periodStart: input.periodStart,
                    periodEnd: input.periodEnd,
                    periodType,
                    totalSales,
                    commissionableAmount,
                    commissionRate: input.commissionRate,
                    commissionAmount,
                    salesTarget: input.salesTarget,
                    targetMet,
                    bonusAmount,
                    payoutStatus: "PENDING",
                },
                update: {
                    totalSales,
                    commissionableAmount,
                    commissionAmount,
                    targetMet,
                    bonusAmount,
                },
            });

            logWithContext("info", "[Commission] Commission calculated", {
                commissionUuid: commission.uuid,
                userUuid: input.userUuid,
                totalSales,
                commissionAmount,
                bonusAmount,
            });

            MetricsService.increment("commission.calculated", 1);

            return commission;

        } catch (error: any) {
        logWithContext("error", "[Commission] Failed to calculate", {
            error: error.message,
        });
        throw error;
        }
    }

    static async payCommission(input: {
        commissionUuid: string;
        paidBy: string;
    }) {
        const commission = await prisma.commission.update({
            where: { uuid: input.commissionUuid },
            data: {
                payoutStatus: "PAID",
                paidAt: new Date(),
                paidBy: input.paidBy,
            },
        });

        logWithContext("info", "[Commission] Commission paid", {
            commissionUuid: input.commissionUuid,
            amount: commission.commissionAmount + commission.bonusAmount,
        });

        return commission;
    }

    static async getStaffTipSummary(input: {
        userUuid: string;
        storeUuid: string;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: any = {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
        };

        if (input.dateFrom || input.dateTo) {
            where.createdAt = {};
            if (input.dateFrom) where.createdAt.gte = input.dateFrom;
            if (input.dateTo) where.createdAt.lte = input.dateTo;
        }

        const distributions = await prisma.tipDistribution.findMany({
            where,
            include: {
                tipPool: true,
            },
            orderBy: { createdAt: "desc" },
        });

        const totalTips = distributions.reduce((sum, d) => sum + d.tipAmount, 0);
        const paidTips = distributions
            .filter((d) => d.payoutStatus === "PAID")
            .reduce((sum, d) => sum + d.tipAmount, 0);
        const pendingTips = totalTips - paidTips;

        return {
            distributions,
            summary: {
                totalTips,
                paidTips,
                pendingTips,
                distributionCount: distributions.length,
            },
        };
    }

    static async getStaffCommissionSummary(input: {
        userUuid: string;
        storeUuid: string;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: any = {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
        };

        if (input.dateFrom || input.dateTo) {
            where.periodStart = {};
            if (input.dateFrom) where.periodStart.gte = input.dateFrom;
            if (input.dateTo) where.periodStart.lte = input.dateTo;
        }

        const commissions = await prisma.commission.findMany({
            where,
            orderBy: { periodStart: "desc" },
        });

        const totalCommission = commissions.reduce(
            (sum, c) => sum + c.commissionAmount + c.bonusAmount,
            0
        );
        const paidCommission = commissions
            .filter((c) => c.payoutStatus === "PAID")
            .reduce((sum, c) => sum + c.commissionAmount + c.bonusAmount, 0);
        const pendingCommission = totalCommission - paidCommission;

        return {
            commissions,
            summary: {
                totalCommission,
                paidCommission,
                pendingCommission,
                totalSales: commissions.reduce((sum, c) => sum + c.totalSales, 0),
            },
        };
    }
}