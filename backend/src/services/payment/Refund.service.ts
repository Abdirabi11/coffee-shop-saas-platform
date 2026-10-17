import { PaymentProvider, type Prisma, type RefundStatus } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/PaymentStateMachine.ts";
import { RefundStateMachine } from "../../domain/payment/RefundStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { PaymentRestrictionService } from "./PaymentRestriction.service.ts";
import { CashDrawerService } from "../staff/CashDrawer.service.ts";

// Refunds that count against a payment's refundable amount: paid back,
// being sent, waiting to be paid out, or parked for approval. FAILED and
// REJECTED ones release their amount.
const COMMITTED_REFUND_STATUSES: readonly RefundStatus[] = ["PENDING_APPROVAL", "REQUESTED", "PROCESSING", "COMPLETED"];

// Payments a refund can be taken against. PARTIALLY_REFUNDED allows a
// further partial refund up to what's left.
const REFUNDABLE_PAYMENT_STATUSES = new Set(["PAID", "COMPLETED", "PARTIALLY_REFUNDED"]);

// Refunds paid back by staff rather than sent to a provider: cash from a
// drawer (payCashRefund), or a return keyed on the store's card reader
// (markCardRefunded), which we have no API for. RefundProcessorJob and
// processRefund leave them REQUESTED until then.
export const MANUAL_REFUND_PROVIDERS = ["CASH", "CARD_TERMINAL"];


export class RefundService{
    // Requests a refund on an order's payment, for the given amount or
    // whatever is left to refund. Several partial refunds are fine; together
    // they never exceed the payment.
    //
    // One transaction holding the Payment's row lock: the payment must still
    // be refundable, and the amount must fit in what's left after every
    // refund already committed against it (paid out, in flight, waiting to
    // be paid out or parked for approval), not just the completed ones. Two
    // concurrent requests queue on the lock, so the second sees the first.
    static async requestRefund(input: {
        orderUuid: string;
        amount?: number;
        reason: string;
        requestedBy: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                // Order has `payments` (Payment.orderUuid is unique, so at
                // most one); `payment` isn't a relation and made Prisma throw
                payments: { select: { uuid: true } },
                tenantUser: true, // Needed for risk check
            },
        });
 
        if (!order) throw new Error("ORDER_NOT_FOUND");
        const [orderPayment] = order.payments;
        if (!orderPayment) throw new Error("NO_PAYMENT_FOUND");
        if (input.amount !== undefined && (!Number.isInteger(input.amount) || input.amount <= 0)) {
            throw new Error("INVALID_REFUND_AMOUNT");
        }

        // Apply risk policy enforcement before processing; high fraud risk
        // parks the refund for manual review
        let requiresReview = false;
        if (order.tenantUser) {
            await RiskPolicyEnforcer.apply({ tenantUuid: order.tenantUuid, tenantUserUuid: order.tenantUser.uuid });
            requiresReview = await PaymentRestrictionService.hasRestriction(
                order.tenantUser.uuid,
                "REQUIRE_MANUAL_REVIEW"
            );
        }

        const { refund, payment, refundableAmount } = await prisma.$transaction(async (tx) => {
            const payment = await this.lockPayment(tx, orderPayment.uuid);
            if (!REFUNDABLE_PAYMENT_STATUSES.has(payment.status)) {
                throw new Error("PAYMENT_NOT_REFUNDABLE");
            }

            const committed = await this.sumRefunds(tx, payment.uuid, COMMITTED_REFUND_STATUSES);
            const refundableAmount = payment.amount - committed;
            if (refundableAmount <= 0) {
                throw new Error("NOTHING_TO_REFUND");
            }

            const refundAmount = input.amount ?? refundableAmount;
            if (refundAmount > refundableAmount) {
                throw new Error("REFUND_AMOUNT_EXCEEDS_LIMIT");
            }

            const refund = await tx.refund.create({
                data: {
                    tenantUuid: order.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: order.uuid,
                    storeUuid: order.storeUuid,
                    amount: refundAmount,
                    currency: payment.currency,
                    // Refund.type and Refund.provider are required columns
                    type: refundAmount === payment.amount ? "FULL" : "PARTIAL",
                    // Parked as PENDING_APPROVAL, not REQUESTED: the processor
                    // only picks up REQUESTED, so this waits for approveRefund
                    status: requiresReview ? "PENDING_APPROVAL" : "REQUESTED",
                    reason: input.reason,
                    requestedBy: input.requestedBy,
                    provider: payment.provider ?? payment.paymentMethod, // cashier payments may have no provider
                    snapshot: {
                        originalPayment: {
                            amount: payment.amount,
                            status: payment.status,
                        },
                        requestedAmount: refundAmount,
                        refundableAmount,
                        alreadyCommitted: committed,
                        ...(requiresReview && {
                            requiresApproval: true,
                            approvalReason: "High fraud risk - manual review required",
                        }),
                    },
                },
            });

            if (requiresReview) {
                // Create admin alert for manual review
                await tx.adminAlert.create({
                    data: {
                        tenantUuid: order.tenantUuid,
                        storeUuid: order.storeUuid,
                        alertType: "PAYMENT_FAILED", // Use valid AlertType enum value
                        category: "FINANCIAL",
                        level: "WARNING",
                        priority: "HIGH",
                        title: "Refund Requires Manual Approval",
                        message: `Refund for order ${order.orderNumber} requires approval due to high fraud risk`,
                        source: "AUTOMATED_CHECK",
                        context: {
                            refundUuid: refund.uuid,
                            orderUuid: order.uuid,
                            amount: refund.amount,
                            reason: "HIGH_FRAUD_RISK",
                        },
                    },
                });
            }

            return { refund, payment, refundableAmount };
        });

        if (requiresReview) {
            logWithContext("warn", "[Refund] Requires manual approval", {
                refundUuid: refund.uuid,
                orderUuid: order.uuid,
                amount: refund.amount,
            });
            return refund;
        }

        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            paymentUuid: payment.uuid,
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            amount: refund.amount,
            currency: payment.currency,
            reason: input.reason,
            requestedBy: input.requestedBy,
        });
 
        logWithContext("info", "[Refund] Requested", {
            refundUuid: refund.uuid,
            paymentUuid: payment.uuid,
            amount: refund.amount,
            refundableAmount,
        });
    
        return refund;
    }

    // Locks a payment's row for the rest of the transaction and returns it
    // as it is now. Every path that commits refund money against a payment
    // takes this lock first, so their limit checks can't interleave.
    private static async lockPayment(tx: Prisma.TransactionClient, paymentUuid: string) {
        await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "uuid" = ${paymentUuid} FOR UPDATE`;
        return tx.payment.findUniqueOrThrow({ where: { uuid: paymentUuid } });
    }

    private static async sumRefunds(
        tx: Prisma.TransactionClient,
        paymentUuid: string,
        statuses: readonly RefundStatus[],
        excludeRefundUuid?: string,
    ) {
        const totals = await tx.refund.aggregate({
            where: {
                paymentUuid,
                status: { in: [...statuses] },
                ...(excludeRefundUuid && { uuid: { not: excludeRefundUuid } }),
            },
            _sum: { amount: true },
        });
        return totals._sum.amount ?? 0;
    }

    // Before a refund is paid out by hand (cash from a drawer, or a return on
    // the card reader), under the payment's lock: the payment must still be
    // refundable (not voided since the request), and what's already been
    // paid back plus this refund must not exceed it.
    private static async assertPayoutWithinLimit(
        tx: Prisma.TransactionClient,
        refund: { uuid: string; paymentUuid: string; amount: number },
    ) {
        const payment = await this.lockPayment(tx, refund.paymentUuid);
        // Payouts of this payment's refunds queue on that lock, so this is
        // current: a payout we waited on may have paid this very refund
        const current = await tx.refund.findUniqueOrThrow({ where: { uuid: refund.uuid }, select: { status: true } });
        if (current.status !== "REQUESTED") throw new Error(`REFUND_NOT_PAYABLE: ${current.status}`);
        if (!REFUNDABLE_PAYMENT_STATUSES.has(payment.status)) {
            throw new Error("PAYMENT_NOT_REFUNDABLE");
        }
        const paidBack = await this.sumRefunds(tx, payment.uuid, ["PROCESSING", "COMPLETED"], refund.uuid);
        if (paidBack + refund.amount > payment.amount) {
            throw new Error("REFUND_AMOUNT_EXCEEDS_LIMIT");
        }
        return payment;
    }

    // After a refund turns COMPLETED: moves the payment to REFUNDED or
    // PARTIALLY_REFUNDED from its completed refunds. The payment must be
    // locked (lockPayment) in this transaction.
    private static async settlePaymentStatus(
        tx: Prisma.TransactionClient,
        payment: { uuid: string; amount: number; status: string },
    ) {
        const totalRefunded = await this.sumRefunds(tx, payment.uuid, ["COMPLETED"]);
        const next = totalRefunded >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
        PaymentStateMachine.assertTransition(payment.status, next);
        await tx.payment.update({ where: { uuid: payment.uuid }, data: { status: next } });
        return next;
    }
 
    // Manager decisions on a refund parked as PENDING_APPROVAL. The status
    // change is conditional, so of two concurrent decisions only one applies.
    // The requester can't approve their own refund.
    static async approveRefund(input: {
        tenantUuid: string;
        refundUuid: string;
        approvedBy: string;
    }) {
        const refund = await this.findPendingApproval(input.tenantUuid, input.refundUuid, "REQUESTED");

        if (refund.requestedBy && refund.requestedBy === input.approvedBy) {
            throw new Error("REFUND_SELF_APPROVAL_NOT_ALLOWED");
        }

        const claimed = await prisma.refund.updateMany({
            where: { uuid: refund.uuid, tenantUuid: input.tenantUuid, status: "PENDING_APPROVAL" },
            data: { status: "REQUESTED", approvedBy: input.approvedBy, approvedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("REFUND_ALREADY_DECIDED");

        // Now queued for RefundProcessorJob, like a refund that never needed review
        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            orderUuid: refund.orderUuid,
            tenantUuid: refund.tenantUuid,
            storeUuid: refund.storeUuid,
            amount: refund.amount,
            currency: refund.currency,
            reason: refund.reason,
            requestedBy: refund.requestedBy,
            approvedBy: input.approvedBy,
        });

        logWithContext("info", "[Refund] Approved", {
            refundUuid: refund.uuid,
            approvedBy: input.approvedBy,
            amount: refund.amount,
        });

        return prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    }

    static async rejectRefund(input: {
        tenantUuid: string;
        refundUuid: string;
        rejectedBy: string;
        reason: string;
    }) {
        const refund = await this.findPendingApproval(input.tenantUuid, input.refundUuid, "REJECTED");

        const claimed = await prisma.refund.updateMany({
            where: { uuid: refund.uuid, tenantUuid: input.tenantUuid, status: "PENDING_APPROVAL" },
            data: {
                status: "REJECTED",
                // Refund has no rejection columns; keep the decision with it
                metadata: {
                    ...((refund.metadata as Record<string, unknown> | null) ?? {}),
                    rejection: {
                        rejectedBy: input.rejectedBy,
                        rejectedAt: new Date().toISOString(),
                        reason: input.reason,
                    },
                },
            },
        });
        if (claimed.count === 0) throw new Error("REFUND_ALREADY_DECIDED");

        logWithContext("warn", "[Refund] Rejected", {
            refundUuid: refund.uuid,
            rejectedBy: input.rejectedBy,
            reason: input.reason,
        });

        return prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    }

    private static async findPendingApproval(tenantUuid: string, refundUuid: string, to: "REQUESTED" | "REJECTED") {
        const refund = await prisma.refund.findFirst({ where: { uuid: refundUuid, tenantUuid } });
        if (!refund) throw new Error("REFUND_NOT_FOUND");
        if (refund.status !== "PENDING_APPROVAL") {
            throw new Error(`REFUND_NOT_PENDING_APPROVAL: ${refund.status}`);
        }
        RefundStateMachine.assertTransition(refund.status, to);
        return refund;
    }

    static async processRefund(refundUuid: string) {
        const refund = await prisma.refund.findUnique({
            where: { uuid: refundUuid },
            include: { payment: true },
        });
    
        if (!refund) throw new Error("REFUND_NOT_FOUND");
        if (refund.status !== "REQUESTED") {
            logWithContext("warn", "[Refund] Not in REQUESTED status", {
                refundUuid: refund.uuid,
                status: refund.status,
            });
            return refund;
        };

        // Cash and card-terminal refunds have no provider API to call: staff
        // pay them back at the store (payCashRefund, markCardRefunded). Left
        // REQUESTED for that, not failed.
        if (MANUAL_REFUND_PROVIDERS.includes(refund.provider)) {
            logWithContext("info", "[Refund] Waits to be paid back at the store", {
                refundUuid: refund.uuid,
                provider: refund.provider,
            });
            return refund;
        }
    
        RefundStateMachine.assertTransition(refund.status, "PROCESSING");
    
        // Claim it: only one caller can move REQUESTED -> PROCESSING. The
        // status check above is a fast path; two instances can both pass it.
        const claimed = await prisma.refund.updateMany({
            where: { uuid: refund.uuid, status: "REQUESTED" },
            data: { status: "PROCESSING" },
        });
        if (claimed.count === 0) {
            logWithContext("warn", "[Refund] Already claimed by another processor", {
                refundUuid: refund.uuid,
            });
            return prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
        }
    
        EventBus.emit("REFUND_PROCESSING", {
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            orderUuid: refund.orderUuid,
            storeUuid: refund.storeUuid,
        });
    
        try {
            const result = await PaymentProviderAdapter.refund({
                provider: refund.provider,
                providerRef: refund.payment.providerRef!,
                amount: refund.amount,
                // One provider refund per Refund row, whatever retries or
                // races happen on our side
                idempotencyKey: `refund-${refund.uuid}`,
            });
    
            // Update refund and payment status in transaction
            await prisma.$transaction(async (tx) => {
                RefundStateMachine.assertTransition("PROCESSING", "COMPLETED");
        
                await tx.refund.update({
                    where: { uuid: refund.uuid },
                    data: {
                        status: "COMPLETED",
                        providerRef: result.providerRef,
                        processedAt: new Date(),
                        snapshot: result.snapshot || {},
                    },
                });
        
                // From the payment as it is now (an earlier partial refund may
                // have moved it on since this refund was read)
                const payment = await this.lockPayment(tx, refund.paymentUuid);
                await this.settlePaymentStatus(tx, payment);
            });
        
            EventBus.emit("REFUND_COMPLETED", {
                refundUuid: refund.uuid,
                paymentUuid: refund.paymentUuid,
                orderUuid: refund.orderUuid,
                tenantUuid: refund.tenantUuid,
                storeUuid: refund.storeUuid,
                amount: refund.amount,
            });
    
            logWithContext("info", "[Refund] Completed", {
                refundUuid: refund.uuid,
                paymentUuid: refund.paymentUuid,
                amount: refund.amount,
            });
        
            MetricsService.increment(
                refund.amount < refund.payment.amount
                ? "refund.partial.count"
                : "refund.full.count",
                1,
                { provider: refund.provider }
            );
    
            return refund;
        } catch (error: any) {
            RefundStateMachine.assertTransition("PROCESSING", "FAILED");
        
            await prisma.refund.update({
                where: { uuid: refund.uuid },
                data: {
                    status: "FAILED",
                    failureReason: error.message,
                },
            });
        
            EventBus.emit("REFUND_FAILED", {
                refundUuid: refund.uuid,
                paymentUuid: refund.paymentUuid,
                orderUuid: refund.orderUuid,
                storeUuid: refund.storeUuid,
                reason: error.message,
            });
        
            logWithContext("error", "[Refund] Failed", {
                refundUuid: refund.uuid,
                error: error.message,
            });
        
            throw error;
        }
    }
 
    // Pays a cash refund out of an open cash drawer. A cash refund has no
    // provider: it stays REQUESTED (processRefund and RefundProcessorJob
    // leave it alone) until someone at a till hands the money over.
    //
    // One transaction, holding the drawer's row lock (the same lock as
    // payments, drops and closing): the drawer must be OPEN, in the refund's
    // store, the caller's own (or the caller a supervisor), and hold at least
    // the refund in expected cash; the payment must still be refundable and
    // the refunds within it (assertPayoutWithinLimit); the refund is claimed
    // REQUESTED -> COMPLETED once and records the drawer, whose expected cash
    // goes down by it. No open drawer: NO_OPEN_DRAWER, and the refund waits.
    static async payCashRefund(input: {
        tenantUuid: string;
        refundUuid: string;
        drawerUuid: string;
        paidBy: string;
        actorIsSupervisor: boolean;
    }) {
        const result = await prisma.$transaction(async (tx) => {
            const refund = await tx.refund.findFirst({
                where: { uuid: input.refundUuid, tenantUuid: input.tenantUuid },
            });
            if (!refund) throw new Error("REFUND_NOT_FOUND");
            if (refund.provider !== "CASH") throw new Error("NOT_A_CASH_REFUND");
            if (refund.status !== "REQUESTED") throw new Error(`REFUND_NOT_PAYABLE: ${refund.status}`);

            // Payment lock before the drawer's, the order a void takes them in
            const payment = await this.assertPayoutWithinLimit(tx, refund);

            await tx.$queryRaw`
                SELECT 1 FROM "CashDrawer"
                WHERE "uuid" = ${input.drawerUuid} AND "tenantUuid" = ${input.tenantUuid}
                FOR UPDATE
            `;
            const drawer = await tx.cashDrawer.findFirst({
                where: { uuid: input.drawerUuid, tenantUuid: input.tenantUuid },
                include: { cashDrops: true },
            });
            if (!drawer || drawer.status !== "OPEN") throw new Error("NO_OPEN_DRAWER");
            if (drawer.storeUuid !== refund.storeUuid) throw new Error("DRAWER_WRONG_STORE");
            if (drawer.userUuid !== input.paidBy && !input.actorIsSupervisor) throw new Error("DRAWER_NOT_YOURS");

            const { expectedCash } = await CashDrawerService.expectedTotals(tx, drawer);
            if (expectedCash < refund.amount) throw new Error("INSUFFICIENT_DRAWER_CASH");

            RefundStateMachine.assertTransition("REQUESTED", "PROCESSING");
            RefundStateMachine.assertTransition("PROCESSING", "COMPLETED");
            const claimed = await tx.refund.updateMany({
                where: { uuid: refund.uuid, status: "REQUESTED" },
                data: {
                    status: "COMPLETED",
                    processedAt: new Date(),
                    cashDrawerUuid: drawer.uuid,
                    approvedBy: refund.approvedBy ?? input.paidBy,
                },
            });
            if (claimed.count === 0) throw new Error("REFUND_NOT_PAYABLE: already paid");

            const next = await this.settlePaymentStatus(tx, payment);

            return { refund, drawerUuid: drawer.uuid, paymentStatus: next };
        });

        const { refund } = result;
        EventBus.emit("REFUND_COMPLETED", {
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            orderUuid: refund.orderUuid,
            tenantUuid: refund.tenantUuid,
            storeUuid: refund.storeUuid,
            amount: refund.amount,
        });

        logWithContext("info", "[Refund] Cash refund paid out", {
            refundUuid: refund.uuid,
            drawerUuid: result.drawerUuid,
            amount: refund.amount,
            paidBy: input.paidBy,
        });
        MetricsService.increment("refund.cash.paid", 1);

        return prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    }

    // Records a card-terminal refund as paid back. We can't refund through
    // the card reader from here, so a manager keys the return on the store's
    // physical terminal and then marks the refund done, optionally with the
    // reader's reference. Same guards as a cash payout: the refund is claimed
    // REQUESTED -> COMPLETED once, under the payment's lock, and only while
    // the payment is refundable and the refunds stay within it.
    static async markCardRefunded(input: {
        tenantUuid: string;
        refundUuid: string;
        markedBy: string;
        terminalReference?: string;
    }) {
        const result = await prisma.$transaction(async (tx) => {
            const refund = await tx.refund.findFirst({
                where: { uuid: input.refundUuid, tenantUuid: input.tenantUuid },
            });
            if (!refund) throw new Error("REFUND_NOT_FOUND");
            if (refund.provider !== "CARD_TERMINAL") throw new Error("NOT_A_CARD_TERMINAL_REFUND");
            if (refund.status !== "REQUESTED") throw new Error(`REFUND_NOT_PAYABLE: ${refund.status}`);

            const payment = await this.assertPayoutWithinLimit(tx, refund);

            RefundStateMachine.assertTransition("REQUESTED", "PROCESSING");
            RefundStateMachine.assertTransition("PROCESSING", "COMPLETED");
            const claimed = await tx.refund.updateMany({
                where: { uuid: refund.uuid, status: "REQUESTED" },
                data: {
                    status: "COMPLETED",
                    processedAt: new Date(),
                    providerRef: input.terminalReference ?? null,
                    approvedBy: refund.approvedBy ?? input.markedBy,
                    metadata: {
                        ...((refund.metadata as Record<string, unknown> | null) ?? {}),
                        cardTerminalRefund: {
                            markedBy: input.markedBy,
                            markedAt: new Date().toISOString(),
                            terminalReference: input.terminalReference ?? null,
                        },
                    },
                },
            });
            if (claimed.count === 0) throw new Error("REFUND_NOT_PAYABLE: already paid");

            const paymentStatus = await this.settlePaymentStatus(tx, payment);
            return { refund, paymentStatus };
        });

        const { refund } = result;
        EventBus.emit("REFUND_COMPLETED", {
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            orderUuid: refund.orderUuid,
            tenantUuid: refund.tenantUuid,
            storeUuid: refund.storeUuid,
            amount: refund.amount,
        });

        logWithContext("info", "[Refund] Card-terminal refund marked paid back", {
            refundUuid: refund.uuid,
            amount: refund.amount,
            markedBy: input.markedBy,
            paymentStatus: result.paymentStatus,
        });
        MetricsService.increment("refund.card_terminal.paid", 1);

        return prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    }

    // Provider-side refund notification (Stripe charge.refunded).
    //
    // totalRefunded is the provider's CUMULATIVE amount refunded on the
    // payment (Stripe amount_refunded), not the size of this one refund, and
    // a charge.refunded event carries the charge id, which is the same for
    // every refund on that charge. So instead of recording "this event's
    // refund", reconcile: whatever the provider has refunded beyond what we
    // already hold (COMPLETED) or are in the middle of sending (PROCESSING,
    // see processRefund) is new and gets one COMPLETED row. That makes the
    // webhook for our own refund a no-op, records a dashboard refund once,
    // and makes duplicate or out-of-order deliveries harmless.
    static async processProviderRefund(input: {
        provider: string;
        providerRef: string;   // payment intent id
        totalRefunded: number; // cumulative, minor units
        chargeId: string;
        snapshot: any;
    }) {
        const provider = input.provider.toUpperCase() as PaymentProvider;
        if (!Object.values(PaymentProvider).includes(provider)) {
            throw new Error(`UNKNOWN_PROVIDER: ${input.provider}`);
        }

        const payment = await prisma.payment.findFirst({
            where: { provider, providerRef: input.providerRef },
            select: { uuid: true },
        });
        if (!payment) {
            throw new Error("PAYMENT_NOT_FOUND");
        }

        const result = await prisma.$transaction(async (tx) => {
            // Serializes concurrent refund webhooks for the same payment
            await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "uuid" = ${payment.uuid} FOR UPDATE`;
            const locked = await tx.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } });

            const sumByStatus = async (status: "COMPLETED" | "PROCESSING") =>
                (await tx.refund.aggregate({
                    where: { paymentUuid: locked.uuid, status },
                    _sum: { amount: true },
                }))._sum.amount ?? 0;

            const completed = await sumByStatus("COMPLETED");
            const inFlight = await sumByStatus("PROCESSING");
            const newAmount = input.totalRefunded - completed - inFlight;

            if (newAmount <= 0) {
                return { refund: null, completed, inFlight };
            }

            const refundedAfter = completed + newAmount;
            const refund = await tx.refund.create({
                data: {
                    tenantUuid: locked.tenantUuid,
                    paymentUuid: locked.uuid,
                    orderUuid: locked.orderUuid,
                    storeUuid: locked.storeUuid,

                    provider: locked.provider ?? locked.paymentMethod,
                    // Unique per refunded total, so it identifies this step
                    providerRef: `${input.chargeId}:${input.totalRefunded}`,

                    amount: newAmount,
                    currency: locked.currency,
                    type: newAmount >= locked.amount ? "FULL" : "PARTIAL",

                    status: "COMPLETED",
                    reason: "Refund processed by provider",
                    requestedBy: "SYSTEM",
                    processedAt: new Date(),

                    snapshot: input.snapshot,
                },
            });

            const nextStatus = refundedAfter >= locked.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
            if (locked.status !== nextStatus) {
                if (PaymentStateMachine.canTransition(locked.status, nextStatus)) {
                    await tx.payment.update({
                        where: { uuid: locked.uuid },
                        data: { status: nextStatus },
                    });
                } else {
                    // e.g. a refund on a payment we never saw captured. Throwing
                    // would make the provider retry forever; flag it instead.
                    await tx.payment.update({
                        where: { uuid: locked.uuid },
                        data: {
                            flaggedForReview: true,
                            flaggedAt: new Date(),
                            flagReason: `PROVIDER_REFUND_ON_${locked.status}_PAYMENT: ${input.chargeId}`,
                        },
                    });
                }
            }

            return { refund, completed: refundedAfter, inFlight };
        });

        if (!result.refund) {
            logWithContext("info", "[Refund] Provider refund already recorded or in flight", {
                paymentUuid: payment.uuid,
                totalRefunded: input.totalRefunded,
                completed: result.completed,
                inFlight: result.inFlight,
            });
            return null;
        }

        const { refund } = result;
        EventBus.emit("REFUND_COMPLETED", {
            refundUuid: refund.uuid,
            paymentUuid: refund.paymentUuid,
            orderUuid: refund.orderUuid,
            tenantUuid: refund.tenantUuid,
            storeUuid: refund.storeUuid,
            amount: refund.amount,
        });

        logWithContext("info", "[Refund] Processed from webhook", {
            refundUuid: refund.uuid,
            amount: refund.amount,
            totalRefunded: input.totalRefunded,
        });

        return refund;
    }
};

