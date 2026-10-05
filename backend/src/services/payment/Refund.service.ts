import { PaymentProvider } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/PaymentStateMachine.ts";
import { RefundStateMachine } from "../../domain/payment/RefundStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { PaymentRestrictionService } from "./PaymentRestriction.service.ts";


export class RefundService{
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
                payments: true,
                refunds: true,
                tenantUser: true, // Needed for risk check
            },
        });
 
        if (!order) throw new Error("ORDER_NOT_FOUND");
        const [payment] = order.payments;
        if (!payment) throw new Error("NO_PAYMENT_FOUND");
    
        //Check both PAID and COMPLETED (cashier flow uses COMPLETED)
        if (payment.status !== "PAID" && payment.status !== "COMPLETED") {
            throw new Error("PAYMENT_NOT_REFUNDABLE");
        };
    
        const totalPaid = payment.amount;
        const refundedSoFar = order.refunds
            .filter((r) => r.status === "COMPLETED")
            .reduce((sum, r) => sum + r.amount, 0);
    
        const refundableAmount = totalPaid - refundedSoFar;
        if (refundableAmount <= 0) {
            throw new Error("NOTHING_TO_REFUND");
        };
 
        const refundAmount = input.amount ?? refundableAmount;
        if (refundAmount > refundableAmount) {
            throw new Error("REFUND_AMOUNT_EXCEEDS_LIMIT");
        };
        if (refundAmount <= 0) {
            throw new Error("INVALID_REFUND_AMOUNT");
        };
 
        // Refund.type and Refund.provider are required columns
        const refundType = refundAmount === totalPaid ? "FULL" : "PARTIAL";
        const refundProvider = payment.provider ?? payment.paymentMethod; // cashier payments may have no provider

        // Apply risk policy enforcement before processing
        if (order.tenantUser) {
            await RiskPolicyEnforcer.apply({ tenantUuid: order.tenantUuid, tenantUserUuid: order.tenantUser.uuid });
        
            // Check if manual review is required due to high fraud risk
            const requiresReview = await PaymentRestrictionService.hasRestriction(
                order.tenantUser.uuid,
                "REQUIRE_MANUAL_REVIEW"
            );
        
            if (requiresReview) {
                // Create refund marked as requiring approval
                const refund = await prisma.refund.create({
                    data: {
                        tenantUuid: order.tenantUuid,
                        paymentUuid: payment.uuid,
                        orderUuid: order.uuid,
                        storeUuid: order.storeUuid,
                        amount: refundAmount,
                        currency: payment.currency,
                        type: refundType,
                        status: "REQUESTED",
                        reason: input.reason,
                        requestedBy: input.requestedBy,
                        provider: refundProvider,
                        snapshot: {
                            originalPayment: {
                                amount: payment.amount,
                                status: payment.status,
                            },
                            requestedAmount: refundAmount,
                            refundableAmount,
                            requiresApproval: true,
                            approvalReason: "High fraud risk - manual review required",
                        },
                    },
                });
        
                // Create admin alert for manual review
                await prisma.adminAlert.create({
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
        
                logWithContext("warn", "[Refund] Requires manual approval", {
                    refundUuid: refund.uuid,
                    orderUuid: order.uuid,
                    amount: refundAmount,
                });
        
                return refund;
            }
        };
        // Create normal refund record
        const refund = await prisma.refund.create({
            data: {
                tenantUuid: order.tenantUuid,
                paymentUuid: payment.uuid,
                orderUuid: order.uuid,
                storeUuid: order.storeUuid,
                amount: refundAmount,
                currency: payment.currency,
                type: refundType,
                status: "REQUESTED",
                reason: input.reason,
                requestedBy: input.requestedBy,
                provider: refundProvider,
                snapshot: {
                    originalPayment: {
                        amount: payment.amount,
                        status: payment.status,
                    },
                    requestedAmount: refundAmount,
                    refundableAmount,
                },
            },
        });
 
        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            paymentUuid: payment.uuid,
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            amount: refundAmount,
            currency: payment.currency,
            reason: input.reason,
            requestedBy: input.requestedBy,
        });
 
        logWithContext("info", "[Refund] Requested", {
            refundUuid: refund.uuid,
            paymentUuid: payment.uuid,
            amount: refundAmount,
            });
    
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
    
        RefundStateMachine.assertTransition(refund.status, "PROCESSING");
    
        await prisma.refund.update({
            where: { uuid: refund.uuid },
            data: { status: "PROCESSING" },
        });
    
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
        
                // Calculate total refunded amount
                const totals = await tx.refund.aggregate({
                    where: {
                        paymentUuid: refund.paymentUuid,
                        status: "COMPLETED",
                    },
                    _sum: { amount: true },
                });
        
                const totalRefunded = totals._sum.amount || 0;
        
                if (totalRefunded >= refund.payment.amount) {
                    PaymentStateMachine.assertTransition(
                        refund.payment.status,
                        "REFUNDED"
                    );
                    await tx.payment.update({
                        where: { uuid: refund.paymentUuid },
                        data: { status: "REFUNDED" },
                    });
                } else {
                    PaymentStateMachine.assertTransition(
                        refund.payment.status,
                        "PARTIALLY_REFUNDED"
                    );
                    await tx.payment.update({
                        where: { uuid: refund.paymentUuid },
                        data: { status: "PARTIALLY_REFUNDED" },
                    });
                }
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

