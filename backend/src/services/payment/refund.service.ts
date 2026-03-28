import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { RefundStateMachine } from "../../domain/payment/RefundStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
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
                payment: true,
                refunds: true,
                tenantUser: true, // Needed for risk check
            },
        });
 
        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (!order.payment) throw new Error("NO_PAYMENT_FOUND");
    
        //Check both PAID and COMPLETED (cashier flow uses COMPLETED)
        if (order.payment.status !== "PAID" && order.payment.status !== "COMPLETED") {
            throw new Error("PAYMENT_NOT_REFUNDABLE");
        };
    
        const totalPaid = order.payment.amount;
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
 
        // Apply risk policy enforcement before processing
        if (order.tenantUser) {
            await RiskPolicyEnforcer.apply(order.tenantUser.uuid);
        
            // Check if manual review is required due to high fraud risk
            const requiresReview = await PaymentRestrictionService.hasRestriction(
                order.tenantUser.uuid,
                "MANUAL_REVIEW"
            );
        
            if (requiresReview) {
                // Create refund marked as requiring approval
                const refund = await prisma.refund.create({
                    data: {
                        tenantUuid: order.tenantUuid,
                        paymentUuid: order.payment.uuid,
                        orderUuid: order.uuid,
                        storeUuid: order.storeUuid,
                        amount: refundAmount,
                        currency: order.payment.currency,
                        status: "REQUESTED",
                        reason: input.reason,
                        requestedBy: input.requestedBy,
                        provider: order.payment.provider,
                        snapshot: {
                            originalPayment: {
                                amount: order.payment.amount,
                                status: order.payment.status,
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
                paymentUuid: order.payment.uuid,
                orderUuid: order.uuid,
                storeUuid: order.storeUuid,
                amount: refundAmount,
                currency: order.payment.currency,
                status: "REQUESTED",
                reason: input.reason,
                requestedBy: input.requestedBy,
                provider: order.payment.provider,
                snapshot: {
                    originalPayment: {
                        amount: order.payment.amount,
                        status: order.payment.status,
                    },
                    requestedAmount: refundAmount,
                    refundableAmount,
                },
            },
        });
 
        EventBus.emit("REFUND_REQUESTED", {
            refundUuid: refund.uuid,
            paymentUuid: order.payment.uuid,
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            amount: refundAmount,
            currency: order.payment.currency,
            reason: input.reason,
            requestedBy: input.requestedBy,
        });
 
        logWithContext("info", "[Refund] Requested", {
            refundUuid: refund.uuid,
            paymentUuid: order.payment.uuid,
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
            RefundStateMachine.assertTransition(refund.status, "FAILED");
        
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
 
    static async processProviderRefund(input: {
        provider: string;
        providerRef: string;
        amount: number;
        snapshot: any;
    }) {
        // Find payment by provider ref
        const payment = await prisma.payment.findFirst({
            where: {
                provider: input.provider.toUpperCase(),
                providerRef: input.providerRef,
            },
            include: { refunds: true },
        });
    
        if (!payment) {
            throw new Error("PAYMENT_NOT_FOUND");
        }
    
        // Idempotency check
        const existing = await prisma.refund.findFirst({
            where: {
                paymentUuid: payment.uuid,
                providerRef: input.snapshot.id,
            },
        });
    
        if (existing) {
            logWithContext("info", "[Refund] Already processed (idempotent)", {
                refundUuid: existing.uuid,
                providerRef: input.snapshot.id,
            });
            return existing;
        }
    
        // Create refund record from webhook
        const refund = await prisma.$transaction(async (tx) => {
            const refund = await tx.refund.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    storeUuid: payment.storeUuid,
            
                    provider: payment.provider,
                    providerRef: input.snapshot.id,
            
                    amount: input.amount,
                    currency: payment.currency,
            
                    status: "COMPLETED",
                    reason: "Refund processed by provider",
                    requestedBy: "SYSTEM",
                    processedAt: new Date(),
        
                    snapshot: input.snapshot,
                },
            });
        
            // Calculate total refunded
            const totals = await tx.refund.aggregate({
                where: {
                    paymentUuid: payment.uuid,
                    status: "COMPLETED",
                },
                _sum: { amount: true },
            });
    
            const totalRefunded = totals._sum.amount || 0;
    
            // Update payment status
            if (totalRefunded >= payment.amount) {
                PaymentStateMachine.assertTransition(payment.status, "REFUNDED");
                await tx.payment.update({
                    where: { uuid: payment.uuid },
                    data: { status: "REFUNDED" },
                });
            } else {
                PaymentStateMachine.assertTransition(
                    payment.status,
                    "PARTIALLY_REFUNDED"
                );
                await tx.payment.update({
                    where: { uuid: payment.uuid },
                    data: { status: "PARTIALLY_REFUNDED" },
                });
            }
        
            return refund;
        });
    
        EventBus.emit("REFUND_COMPLETED", {
            refundUuid: refund.uuid,
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            amount: refund.amount,
        });
    
        logWithContext("info", "[Refund] Processed from webhook", {
            refundUuid: refund.uuid,
            providerRef: input.snapshot.id,
        });
    
        return refund;
    }
};

