import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { StoreStatusService } from "../store/StoreStatus.service.ts";


export class CashDrawerService{

    static async openDrawer(input: {
        tenantUuid: string;
        storeUuid: string;
        userUuid: string;
        startingCash: number; // Cents
        drawerNumber?: string;
        // POS terminal this drawer sits in: cashier payments taken on it are
        // linked to the drawer (Payment.drawerUuid) and counted at close
        terminalId?: string;
        openedBy: string;
    }) {
        try {
            if (!Number.isInteger(input.startingCash) || input.startingCash < 0) {
                throw new Error("INVALID_AMOUNT");
            }
            // Cash payments find their drawer by terminal: a drawer without
            // one would never receive its sales
            if (!input.terminalId) {
                throw new Error("TERMINAL_REQUIRED");
            }

            // Drawer opens at a store run one at a time (a transaction-scoped
            // advisory lock on the store), so two opens can't both pass the
            // checks: one open drawer per person per store, and per terminal
            const drawer = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cash-drawer-open:${input.storeUuid}`}))`;

                await StoreStatusService.assertOperational(input.storeUuid, tx);

                // Check permission (and that the assignment is still current)
                const userStore = await tx.userStore.findUnique({
                    where: {
                        userUuid_storeUuid: {
                            userUuid: input.userUuid,
                            storeUuid: input.storeUuid,
                        },
                    },
                });
                if (!userStore?.isActive || !userStore.canOpenDrawer) {
                    throw new Error("NO_PERMISSION_OPEN_DRAWER");
                };

                const existingDrawer = await tx.cashDrawer.findFirst({
                    where: {
                        storeUuid: input.storeUuid,
                        status: "OPEN",
                        OR: [{ userUuid: input.userUuid }, { terminalId: input.terminalId }],
                    },
                    select: { userUuid: true },
                });
                if (existingDrawer) {
                    throw new Error(existingDrawer.userUuid === input.userUuid
                        ? "DRAWER_ALREADY_OPEN"
                        : "TERMINAL_DRAWER_ALREADY_OPEN");
                }

                const drawer = await tx.cashDrawer.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        userUuid: input.userUuid,
                        drawerNumber: input.drawerNumber,
                        terminalId: input.terminalId,
                        status: "OPEN",
                        openedAt: new Date(),
                        openedBy: input.openedBy,
                        startingCash: input.startingCash,
                    },
                });

                // Create initial cash count
                await tx.cashCount.create({
                    data: {
                        cashDrawerUuid: drawer.uuid,
                        countType: "OPEN",
                        countedBy: input.openedBy,
                        totalCash: input.startingCash,
                        totalBills: input.startingCash, // Assuming all bills initially
                        totalCoins: 0,
                    },
                });

                return drawer;
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

    // Close a drawer: count it against what this drawer should hold.
    //
    // Runs in one transaction holding the drawer's row lock, so concurrent
    // closes (and cashier payments, which update the same row) are
    // serialized: the second close sees the drawer no longer OPEN and fails
    // instead of overwriting the first count. The status change is also
    // conditional on OPEN as a second guard.
    //
    // Expected cash = starting cash
    //   + cash payments taken on THIS drawer (Payment.drawerUuid; not the
    //     whole store), refunded or not; voided ones drop out
    //   - cash refunds paid out of THIS drawer (Refund.cashDrawerUuid; older
    //     refunds without one count against the drawer that took the sale)
    //   - VERIFIED cash drops only
    // Unverified drops still count as cash that should be in the drawer, so a
    // fake drop shows up as a shortage instead of hiding one.
    static async closeDrawer(input: {
        tenantUuid: string;
        drawerUuid: string;
        actualCash: number; // Counted cash in cents
        closedBy: string;
        // Supervisors may close other people's drawers; others only their own
        actorIsSupervisor: boolean;
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
            if (!Number.isInteger(input.actualCash) || input.actualCash < 0) {
                throw new Error("INVALID_AMOUNT");
            }

            const { drawer, updated, expectedCash, variance, requiresApproval, unverifiedDrops } =
                await prisma.$transaction(async (tx) => {
                    await tx.$queryRaw`
                        SELECT 1 FROM "CashDrawer"
                        WHERE "uuid" = ${input.drawerUuid} AND "tenantUuid" = ${input.tenantUuid}
                        FOR UPDATE
                    `;

                    const drawer = await tx.cashDrawer.findFirst({
                        where: { uuid: input.drawerUuid, tenantUuid: input.tenantUuid },
                        include: { cashDrops: true },
                    });

                    if (!drawer) {
                        throw new Error("DRAWER_NOT_FOUND");
                    }
                    if (drawer.userUuid !== input.closedBy && !input.actorIsSupervisor) {
                        throw new Error("DRAWER_NOT_YOURS");
                    }
                    if (drawer.status !== "OPEN") {
                        throw new Error("DRAWER_NOT_OPEN");
                    }

                    const { cashSales, refunded, unverifiedDrops, expectedCash } = await this.expectedTotals(tx, drawer);

                    const variance = input.actualCash - expectedCash;

                    // Check if variance requires approval
                    const varianceThreshold = 500; // $5.00 in cents
                    const requiresApproval = Math.abs(variance) > varianceThreshold;

                    const claimed = await tx.cashDrawer.updateMany({
                        where: { uuid: drawer.uuid, tenantUuid: input.tenantUuid, status: "OPEN" },
                        data: {
                            status: requiresApproval ? "RECONCILING" : "CLOSED",
                            closedAt: new Date(),
                            closedBy: input.closedBy,
                            expectedCash,
                            actualCash: input.actualCash,
                            variance,
                            totalSales: cashSales,
                            cashSales,
                            refunds: refunded,
                            notes: input.notes,
                        },
                    });
                    if (claimed.count === 0) {
                        throw new Error("DRAWER_NOT_OPEN");
                    }

                    // Closing cash count
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

                        await tx.cashCount.create({
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

                    const updated = await tx.cashDrawer.findUniqueOrThrow({ where: { uuid: drawer.uuid } });
                    return { drawer, updated, expectedCash, variance, requiresApproval, unverifiedDrops };
                });

            logWithContext("info", "[CashDrawer] Drawer closed", {
                drawerUuid: drawer.uuid,
                expectedCash,
                actualCash: input.actualCash,
                variance,
                requiresApproval,
                unverifiedDrops,
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
                        unverifiedDrops,
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
                unverifiedDrops,
            };

        } catch (error: any) {
            logWithContext("error", "[CashDrawer] Failed to close drawer", {
                error: error.message,
            });
            throw error;
        }
    }

    // What a drawer should hold (see closeDrawer for the rules). Call with
    // the drawer row locked; `cashDrops` must be the drawer's drops.
    static async expectedTotals(
        tx: Prisma.TransactionClient,
        drawer: { uuid: string; startingCash: number; cashDrops: Array<{ amount: number; verifiedAt: Date | null }> }
    ) {
        // Cash taken on this drawer, refunded or not (a refund is cash out of
        // whichever drawer paid it, counted below); voided sales returned
        // their cash from this drawer, so they drop out
        const cashIn = await tx.payment.aggregate({
            where: {
                drawerUuid: drawer.uuid,
                paymentMethod: "CASH",
                status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
            },
            _sum: { amount: true },
        });

        // Cash refunds paid out of this drawer (RefundService.payCashRefund),
        // plus older refunds recorded without a drawer, which came out of the
        // drawer that took the sale
        const refundsOut = await tx.refund.aggregate({
            where: {
                status: "COMPLETED",
                OR: [
                    { cashDrawerUuid: drawer.uuid },
                    { cashDrawerUuid: null, payment: { drawerUuid: drawer.uuid, paymentMethod: "CASH" } },
                ],
            },
            _sum: { amount: true },
        });

        const verifiedDrops = drawer.cashDrops
            .filter((d) => d.verifiedAt)
            .reduce((sum, d) => sum + d.amount, 0);
        const unverifiedDrops = drawer.cashDrops
            .filter((d) => !d.verifiedAt)
            .reduce((sum, d) => sum + d.amount, 0);

        const cashSales = cashIn._sum.amount || 0;
        const refunded = refundsOut._sum.amount || 0;
        const expectedCash = drawer.startingCash + cashSales - refunded - verifiedDrops;

        return { cashSales, refunded, unverifiedDrops, expectedCash };
    }

    // Takes an OPEN drawer out of service without a count, when its owner
    // loses access (AccessRevocationService). Nobody counted the cash, so it
    // isn't CLOSED: it goes to RECONCILING with the expected amount and no
    // actual/variance, and a CASH_VARIANCE request asks a manager to count
    // it and sign it off (approveCashVariance). Payments stop linking to it
    // because it is no longer OPEN. Runs in the caller's transaction, under
    // the drawer's row lock like closeDrawer. Returns false if the drawer
    // was no longer open.
    static async autoClose(tx: Prisma.TransactionClient, input: {
        tenantUuid: string;
        drawerUuid: string;
        closedBy: string;
        reason: string;
    }) {
        await tx.$queryRaw`
            SELECT 1 FROM "CashDrawer"
            WHERE "uuid" = ${input.drawerUuid} AND "tenantUuid" = ${input.tenantUuid}
            FOR UPDATE
        `;
        const drawer = await tx.cashDrawer.findFirst({
            where: { uuid: input.drawerUuid, tenantUuid: input.tenantUuid, status: "OPEN" },
            include: { cashDrops: true },
        });
        if (!drawer) return false;

        const { cashSales, refunded, unverifiedDrops, expectedCash } = await this.expectedTotals(tx, drawer);
        const note = `Auto-closed due to termination (${input.reason}): cash not counted`;

        await tx.cashDrawer.update({
            where: { uuid: drawer.uuid },
            data: {
                status: "RECONCILING",
                closedAt: new Date(),
                closedBy: input.closedBy,
                expectedCash,
                actualCash: null,
                variance: null,
                totalSales: cashSales,
                cashSales,
                refunds: refunded,
                notes: drawer.notes ? `${drawer.notes}\n${note}` : note,
            },
        });

        await tx.staffApprovalRequest.create({
            data: {
                tenantUuid: drawer.tenantUuid,
                storeUuid: drawer.storeUuid,
                requestedBy: input.closedBy,
                approvalType: "CASH_VARIANCE",
                requestData: {
                    drawerUuid: drawer.uuid,
                    reason: "TERMINATION_AUTO_CLOSE",
                    drawerOwner: drawer.userUuid,
                    expectedCash,
                    actualCash: null,
                    unverifiedDrops,
                },
                status: "PENDING",
            },
        });

        return true;
    }

    //Cash drop (move excess cash to safe)
    //
    // Amount must be a positive whole number of cents. A drop only reduces
    // the drawer's expected cash once a supervisor verifies it (see
    // closeDrawer), so recording a drop can't hide missing cash. Created
    // under the drawer's row lock so it can't land on a drawer being closed.
    static async createCashDrop(input: {
        tenantUuid: string;
        drawerUuid: string;
        amount: number;
        droppedBy: string;
        actorIsSupervisor: boolean;
        reason?: string;
    }) {
        if (!Number.isInteger(input.amount) || input.amount <= 0) {
            throw new Error("INVALID_AMOUNT");
        }

        const cashDrop = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT 1 FROM "CashDrawer"
                WHERE "uuid" = ${input.drawerUuid} AND "tenantUuid" = ${input.tenantUuid}
                FOR UPDATE
            `;
            const drawer = await tx.cashDrawer.findFirst({
                where: { uuid: input.drawerUuid, tenantUuid: input.tenantUuid },
            });

            if (!drawer) {
                throw new Error("DRAWER_NOT_FOUND");
            }
            if (drawer.userUuid !== input.droppedBy && !input.actorIsSupervisor) {
                throw new Error("DRAWER_NOT_YOURS");
            }
            if (drawer.status !== "OPEN") {
                throw new Error("DRAWER_NOT_OPEN");
            }

            // Generate receipt number
            const receiptNumber = `DROP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            return tx.cashDrop.create({
                data: {
                    cashDrawerUuid: drawer.uuid,
                    storeUuid: drawer.storeUuid, // the drawer's store, not a client value
                    amount: input.amount,
                    droppedBy: input.droppedBy,
                    droppedAt: new Date(),
                    reason: input.reason || "Excess cash removal",
                    receiptNumber,
                },
            });
        });

        logWithContext("info", "[CashDrawer] Cash drop created", {
            cashDropUuid: cashDrop.uuid,
            amount: input.amount,
            receiptNumber: cashDrop.receiptNumber,
        });

        MetricsService.increment("cash_drawer.drop", 1, {
            storeUuid: cashDrop.storeUuid,
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
    //
    // Only while the drawer is still open (closing already settled the
    // count), never by the person who made the drop, and only once.
    static async verifyCashDrop(input: {
        tenantUuid: string;
        cashDropUuid: string;
        verifiedBy: string;
    }) {
        const cashDrop = await prisma.$transaction(async (tx) => {
            const drop = await tx.cashDrop.findFirst({
                where: { uuid: input.cashDropUuid, cashDrawer: { tenantUuid: input.tenantUuid } },
                include: { cashDrawer: { select: { uuid: true, status: true } } },
            });

            if (!drop) {
                throw new Error("CASH_DROP_NOT_FOUND");
            }
            if (drop.droppedBy === input.verifiedBy) {
                throw new Error("DROP_SELF_VERIFY");
            }

            await tx.$queryRaw`SELECT 1 FROM "CashDrawer" WHERE "uuid" = ${drop.cashDrawer.uuid} FOR UPDATE`;
            const drawer = await tx.cashDrawer.findUniqueOrThrow({
                where: { uuid: drop.cashDrawer.uuid },
                select: { status: true },
            });
            if (drawer.status !== "OPEN") {
                throw new Error("DRAWER_NOT_OPEN");
            }

            const claimed = await tx.cashDrop.updateMany({
                where: { uuid: drop.uuid, verifiedAt: null },
                data: { verifiedBy: input.verifiedBy, verifiedAt: new Date() },
            });
            if (claimed.count === 0) {
                throw new Error("DROP_ALREADY_VERIFIED");
            }

            return tx.cashDrop.findUniqueOrThrow({ where: { uuid: drop.uuid } });
        });

        logWithContext("info", "[CashDrawer] Cash drop verified", {
            cashDropUuid: input.cashDropUuid,
            verifiedBy: input.verifiedBy,
        });

        return cashDrop;
    }

    // Signs off a drawer in RECONCILING: RECONCILING -> CLOSED, once, by
    // someone other than the drawer's owner, under the drawer's row lock.
    // Also resolves the drawer's pending CASH_VARIANCE approval request
    // (when approved from the drawer route; from the approvals route that
    // request is already claimed).
    //
    // Two cases:
    //  - closed with a count whose variance was over the threshold: signs
    //    that count off (a new count can't replace it);
    //  - taken out of service uncounted (autoClose, staff lost access): the
    //    manager counts it now. actualCash is required, the variance is
    //    worked out against the expected cash recorded at the auto-close,
    //    and a CLOSE cash count is stored.
    static async approveCashVariance(input: {
        tenantUuid: string;
        drawerUuid: string;
        approvedBy: string;
        actualCash?: number;
        notes?: string;
    }) {
        if (input.actualCash !== undefined && (!Number.isInteger(input.actualCash) || input.actualCash < 0)) {
            throw new Error("INVALID_AMOUNT");
        }

        const updated = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT 1 FROM "CashDrawer"
                WHERE "uuid" = ${input.drawerUuid} AND "tenantUuid" = ${input.tenantUuid}
                FOR UPDATE
            `;
            const drawer = await tx.cashDrawer.findFirst({
                where: { uuid: input.drawerUuid, tenantUuid: input.tenantUuid },
            });
            if (!drawer) throw new Error("DRAWER_NOT_FOUND");
            if (drawer.userUuid === input.approvedBy) throw new Error("VARIANCE_SELF_APPROVE");
            if (drawer.status !== "RECONCILING") throw new Error("DRAWER_NOT_RECONCILING");

            const uncounted = drawer.actualCash === null;
            if (uncounted && input.actualCash === undefined) throw new Error("COUNT_REQUIRED");
            if (!uncounted && input.actualCash !== undefined) throw new Error("DRAWER_ALREADY_COUNTED");

            const actualCash = uncounted ? input.actualCash! : drawer.actualCash!;
            const variance = uncounted ? actualCash - drawer.expectedCash : drawer.variance;

            if (uncounted) {
                await tx.cashCount.create({
                    data: {
                        cashDrawerUuid: drawer.uuid,
                        countType: "CLOSE",
                        countedBy: input.approvedBy,
                        totalCash: actualCash,
                        totalBills: actualCash,
                        totalCoins: 0,
                    },
                });
            }

            await tx.cashDrawer.update({
                where: { uuid: drawer.uuid },
                data: {
                    status: "CLOSED",
                    actualCash,
                    variance,
                    varianceApproved: true,
                    varianceApprovedBy: input.approvedBy,
                    ...(uncounted && input.notes && {
                        notes: drawer.notes ? `${drawer.notes}\n${input.notes}` : input.notes,
                    }),
                },
            });

            await tx.staffApprovalRequest.updateMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    approvalType: "CASH_VARIANCE",
                    status: "PENDING",
                    requestData: { path: ["drawerUuid"], equals: input.drawerUuid },
                },
                data: {
                    status: "APPROVED",
                    approvedBy: input.approvedBy,
                    approvalNotes: input.notes,
                    respondedAt: new Date(),
                },
            });

            return tx.cashDrawer.findUniqueOrThrow({ where: { uuid: input.drawerUuid } });
        });

        logWithContext("info", "[CashDrawer] Cash variance approved", {
            drawerUuid: input.drawerUuid,
            variance: updated.variance,
            counted: input.actualCash !== undefined,
            approvedBy: input.approvedBy,
        });

        return updated;
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