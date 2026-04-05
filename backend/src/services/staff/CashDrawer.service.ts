import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


export class CashDrawerService{

    static async openDrawer(input: {
        tenantUuid: string;
        storeUuid: string;
        userUuid: string;
        startingCash: number; // Cents
        drawerNumber?: string;
        openedBy: string;
    }) {
        try {
            // Check if user already has an open drawer
            const existingDrawer = await prisma.cashDrawer.findFirst({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    status: "OPEN",
                },
            });

            if (existingDrawer) {
                throw new Error("DRAWER_ALREADY_OPEN");
            }

            // Check permission
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            if (!userStore?.canOpenDrawer) {
                throw new Error("NO_PERMISSION_OPEN_DRAWER");
            };

            const drawer = await prisma.cashDrawer.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                    drawerNumber: input.drawerNumber,
                    status: "OPEN",
                    openedAt: new Date(),
                    openedBy: input.openedBy,
                    startingCash: input.startingCash,
                },
            });

            // Create initial cash count
            await prisma.cashCount.create({
                data: {
                    cashDrawerUuid: drawer.uuid,
                    countType: "OPEN",
                    countedBy: input.openedBy,
                    totalCash: input.startingCash,
                    totalBills: input.startingCash, // Assuming all bills initially
                    totalCoins: 0,
                },
            });

            logWithContext("info", "[CashDrawer] Drawer opened", {
                drawerUuid: drawer.uuid,
                userUuid: input.userUuid,
                startingCash: input.startingCash,
            });

            MetricsService.increment("cash_drawer.opened", 1, {
                storeUuid: input.storeUuid,
            });

            EventBus.emit("CASH_DRAWER_OPENED", {
                drawerUuid: drawer.uuid,
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
            });

            return drawer;

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Failed to open drawer", {
                error: error.message,
            });
            throw error;
        }
    }

    static async closeDrawer(input: {
        drawerUuid: string;
        actualCash: number; // Counted cash in cents
        closedBy: string;
        cashCount?: {
            pennies?: number;
            nickels?: number;
            dimes?: number;
            quarters?: number;
            ones?: number;
            fives?: number;
            tens?: number;
            twenties?: number;
            fifties?: number;
            hundreds?: number;
        };
        notes?: string;
    }) {
        try {
            const drawer = await prisma.cashDrawer.findUnique({
                where: { uuid: input.drawerUuid },
                include: {
                    cashDrops: true,
                },
            });

            if (!drawer) {
                throw new Error("DRAWER_NOT_FOUND");
            };

            if (drawer.status !== "OPEN") {
                throw new Error("DRAWER_NOT_OPEN");
            }

            // Calculate expected cash
            // Get all cash transactions during this drawer session
            const cashPayments = await prisma.payment.aggregate({
                where: {
                    storeUuid: drawer.storeUuid,
                    paymentMethod: "CASH",
                    status: "COMPLETED",
                    createdAt: {
                        gte: drawer.openedAt!,
                    },
                },
                _sum: { amount: true },
            });

            const cashRefunds = await prisma.payment.aggregate({
                where: {
                    storeUuid: drawer.storeUuid,
                    paymentMethod: "CASH",
                    status: "REFUNDED",
                    createdAt: {
                        gte: drawer.openedAt!,
                    },
                },
                _sum: { amount: true },
            });

            // Calculate total cash drops
            const totalDrops = drawer.cashDrops.reduce((sum, drop) => sum + drop.amount, 0);

            // Expected = Starting + Sales - Refunds - Drops
            const expectedCash =
                drawer.startingCash +
                (cashPayments._sum.amount || 0) -
                (cashRefunds._sum.amount || 0) -
                totalDrops;

            // Calculate variance
            const variance = input.actualCash - expectedCash;

            // Check if variance requires approval
            const varianceThreshold = 500; // $5.00 in cents
            const requiresApproval = Math.abs(variance) > varianceThreshold;

            // Update drawer
            const updated = await prisma.cashDrawer.update({
                where: { uuid: input.drawerUuid },
                data: {
                    status: requiresApproval ? "RECONCILING" : "CLOSED",
                    closedAt: new Date(),
                    closedBy: input.closedBy,
                    expectedCash,
                    actualCash: input.actualCash,
                    variance,
                    totalSales: (cashPayments._sum.amount || 0),
                    cashSales: (cashPayments._sum.amount || 0),
                    refunds: (cashRefunds._sum.amount || 0),
                    notes: input.notes,
                },
            });

            // Create closing cash count
            if (input.cashCount) {
                const count = input.cashCount;
                const totalCoins =
                (count.pennies || 0) * 1 +
                (count.nickels || 0) * 5 +
                (count.dimes || 0) * 10 +
                (count.quarters || 0) * 25;

                const totalBills =
                (count.ones || 0) * 100 +
                (count.fives || 0) * 500 +
                (count.tens || 0) * 1000 +
                (count.twenties || 0) * 2000 +
                (count.fifties || 0) * 5000 +
                (count.hundreds || 0) * 10000;

                await prisma.cashCount.create({
                    data: {
                        cashDrawerUuid: drawer.uuid,
                        countType: "CLOSE",
                        countedBy: input.closedBy,
                        pennies: count.pennies || 0,
                        nickels: count.nickels || 0,
                        dimes: count.dimes || 0,
                        quarters: count.quarters || 0,
                        ones: count.ones || 0,
                        fives: count.fives || 0,
                        tens: count.tens || 0,
                        twenties: count.twenties || 0,
                        fifties: count.fifties || 0,
                        hundreds: count.hundreds || 0,
                        totalCoins,
                        totalBills,
                        totalCash: totalCoins + totalBills,
                    },
                });
            }

            logWithContext("info", "[CashDrawer] Drawer closed", {
                drawerUuid: drawer.uuid,
                expectedCash,
                actualCash: input.actualCash,
                variance,
                requiresApproval,
            });

            MetricsService.increment("cash_drawer.closed", 1, {
                storeUuid: drawer.storeUuid,
            });

            MetricsService.histogram("cash_drawer.variance", Math.abs(variance));

            if (Math.abs(variance) > 0) {
                MetricsService.increment(
                    variance > 0 ? "cash_drawer.overage" : "cash_drawer.shortage",
                    1,
                    { storeUuid: drawer.storeUuid }
                );
            };

            // Create approval request if needed
            if (requiresApproval) {
                await prisma.staffApprovalRequest.create({
                    data: {
                        tenantUuid: drawer.tenantUuid,
                        storeUuid: drawer.storeUuid,
                        requestedBy: drawer.userUuid,
                        approvalType: "CASH_VARIANCE",
                        requestData: {
                        drawerUuid: drawer.uuid,
                        expectedCash,
                        actualCash: input.actualCash,
                        variance,
                        },
                        status: "PENDING",
                    },
                });

                EventBus.emit("CASH_VARIANCE_APPROVAL_NEEDED", {
                    drawerUuid: drawer.uuid,
                    variance,
                    userUuid: drawer.userUuid,
                });
            };

            EventBus.emit("CASH_DRAWER_CLOSED", {
                drawerUuid: drawer.uuid,
                userUuid: drawer.userUuid,
                storeUuid: drawer.storeUuid,
                variance,
            });

            return {
                drawer: updated,
                expectedCash,
                actualCash: input.actualCash,
                variance,
                requiresApproval,
            };

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Failed to close drawer", {
                error: error.message,
            });
            throw error;
        }
    }

    //Cash drop (move excess cash to safe)
    static async createCashDrop(input: {
        drawerUuid: string;
        storeUuid: string;
        amount: number;
        droppedBy: string;
        reason?: string;
    }) {
        const drawer = await prisma.cashDrawer.findUnique({
            where: { uuid: input.drawerUuid },
        });

        if (!drawer) {
            throw new Error("DRAWER_NOT_FOUND");
        }

        if (drawer.status !== "OPEN") {
            throw new Error("DRAWER_NOT_OPEN");
        }

        // Generate receipt number
        const receiptNumber = `DROP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const cashDrop = await prisma.cashDrop.create({
            data: {
                cashDrawerUuid: input.drawerUuid,
                storeUuid: input.storeUuid,
                amount: input.amount,
                droppedBy: input.droppedBy,
                droppedAt: new Date(),
                reason: input.reason || "Excess cash removal",
                receiptNumber,
            },
        });

        logWithContext("info", "[CashDrawer] Cash drop created", {
            cashDropUuid: cashDrop.uuid,
            amount: input.amount,
            receiptNumber,
        });

        MetricsService.increment("cash_drawer.drop", 1, {
            storeUuid: input.storeUuid,
        });

        MetricsService.histogram("cash_drawer.drop_amount", input.amount);

        EventBus.emit("CASH_DROP_CREATED", {
            cashDropUuid: cashDrop.uuid,
            drawerUuid: input.drawerUuid,
            amount: input.amount,
        });

        return cashDrop;
    }

    //Verify cash drop (manager verification)
    static async verifyCashDrop(input: {
        cashDropUuid: string;
        verifiedBy: string;
    }) {
        const cashDrop = await prisma.cashDrop.update({
            where: { uuid: input.cashDropUuid },
            data: {
                verifiedBy: input.verifiedBy,
                verifiedAt: new Date(),
            },
        });

        logWithContext("info", "[CashDrawer] Cash drop verified", {
            cashDropUuid: input.cashDropUuid,
            verifiedBy: input.verifiedBy,
        });

        return cashDrop;
    }

    static async approveCashVariance(input: {
        drawerUuid: string;
        approvedBy: string;
    }) {
        const drawer = await prisma.cashDrawer.update({
            where: { uuid: input.drawerUuid },
            data: {
                status: "CLOSED",
                varianceApproved: true,
                varianceApprovedBy: input.approvedBy,
            },
        });

        logWithContext("info", "[CashDrawer] Cash variance approved", {
            drawerUuid: input.drawerUuid,
            variance: drawer.variance,
            approvedBy: input.approvedBy,
        });

        return drawer;
    }

    static async getActiveDrawer(input: {
        userUuid: string;
        storeUuid: string;
    }) {
        return prisma.cashDrawer.findFirst({
            where: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                status: "OPEN",
            },
            include: {
                cashDrops: true,
            },
        });
    }

    static async getDrawerHistory(input: {
        storeUuid: string;
        userUuid?: string;
        dateFrom?: Date;
        dateTo?: Date;
        page?: number;
        limit?: number;
    }) {
        const page = input.page || 1;
        const limit = input.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            storeUuid: input.storeUuid,
        };

        if (input.userUuid) {
            where.userUuid = input.userUuid;
        };

        if (input.dateFrom || input.dateTo) {
            where.openedAt = {};
            if (input.dateFrom) where.openedAt.gte = input.dateFrom;
            if (input.dateTo) where.openedAt.lte = input.dateTo;
        };

        const [drawers, total] = await Promise.all([
            prisma.cashDrawer.findMany({
                where,
                include: {
                    user: {
                        select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                        },
                    },
                    cashDrops: true,
                    cashCounts: true,
                },
                orderBy: { openedAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.cashDrawer.count({ where }),
        ]);

        return {
            data: drawers,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }
}