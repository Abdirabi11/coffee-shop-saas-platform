import { logWithContext } from "../infrastructure/observability/logger.ts";
import { MetricsService } from "../infrastructure/observability/metricsService.ts";
import { PaymentFraudEvaluator } from "../services/payment/paymentFraudEvaluator.service.ts";
import { eventBus } from "./eventBus.ts";


export function registerPaymentEventHandlers() {
 
    eventBus.on("PAYMENT_CONFIRMED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, storeUuid, amount } = payload;
    
        logWithContext("info", "[Event:PAYMENT_CONFIRMED] Processing", {
            paymentUuid,
            orderUuid,
        });
    
        try {
            // 1. Record in ledger
            // await LedgerService.record({ ... });
        
            // 3. Send receipt email
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                include: { tenantUser: { include: { user: true } } },
            });
        
            if (order?.tenantUser?.user?.email) {
                // await EmailService.sendPaymentReceipt(order.tenantUser.user.email, { ... });
            }
        
            // 4. Track metrics
            MetricsService.increment("revenue.total", amount, { storeUuid });
        
            // 5. Fraud evaluation (positive signal — reduces risk score)
            await PaymentFraudEvaluator.evaluate("PAYMENT_CONFIRMED", {
                tenantUserUuid: order?.tenantUserUuid,
                paymentUuid,
                orderUuid,
                tenantUuid,
                storeUuid,
                amount,
            });
        } catch (error: any) {
            logWithContext("error", "[Event:PAYMENT_CONFIRMED] Failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
    
    eventBus.on("PAYMENT_FAILED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, storeUuid, failureCode, failureReason } = payload;
    
        logWithContext("warn", "[Event:PAYMENT_FAILED] Processing", {
            paymentUuid,
            orderUuid,
            failureCode,
            });
    
        try {
            //Fraud evaluation (negative signal — increases risk score)
            await PaymentFraudEvaluator.evaluate("PAYMENT_FAILED", {
                tenantUserUuid: undefined, // Will be resolved inside evaluator
                paymentUuid,
                orderUuid,
                failureCode,
                failureReason,
            });
        
            // 3. Send failure notification
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                include: { tenantUser: { include: { user: true } } },
            });
        
            if (order?.tenantUser?.user?.email) {
                // await EmailService.sendPaymentFailed(order.tenantUser.user.email, { ... });
            }
    
            // 4. Create fraud alert if provider flagged it
            if (failureCode === "FRAUD_SUSPECTED") {
                await prisma.adminAlert.create({
                    data: {
                        tenantUuid,
                        storeUuid,
                        alertType: "FRAUD_DETECTED", // Valid AlertType enum value
                        category: "SECURITY",
                        level: "CRITICAL",
                        priority: "HIGH",
                        source: "AUTOMATED_CHECK",
                        title: "Fraud Suspected on Payment",
                        message: `Payment ${paymentUuid} flagged for potential fraud`,
                        context: { paymentUuid, orderUuid, failureCode },
                    },
                });
            }
        
            // 5. Metrics
            MetricsService.increment("payment.failed", 1, { storeUuid });
        } catch (error: any) {
            logWithContext("error", "[Event:PAYMENT_FAILED] Handler error", {
                paymentUuid,
                error: error.message,
            });
        }
    });
 
    // PAYMENT TIMEOUT
    eventBus.on("PAYMENT_TIMEOUT", async (payload) => {
        const { orderUuid, storeUuid, paymentUuid } = payload;
    
        logWithContext("warn", "[Event:PAYMENT_TIMEOUT] Processing", { orderUuid });
    
        MetricsService.increment("checkout.timeout", 1, { storeUuid });
    
        await PaymentFraudEvaluator.evaluate("PAYMENT_TIMEOUT", {
            orderUuid,
            paymentUuid,
        });
    });
 
    // CASHIER PAYMENT COMPLETED (manual cashier flow)
    eventBus.on("CASHIER_PAYMENT_COMPLETED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, storeUuid, amount, paymentMethod } = payload;
    
        logWithContext("info", "[Event:CASHIER_PAYMENT_COMPLETED] Processing", {
            paymentUuid,
            orderUuid,
        });
    
        try {
            // Track metrics
            MetricsService.increment("revenue.total", amount, { storeUuid });
            MetricsService.increment(
                paymentMethod === "CASH" ? "payment.cash" : "payment.card",
                1,
                { storeUuid }
            );
    
        } catch (error: any) {
            logWithContext("error", "[Event:CASHIER_PAYMENT_COMPLETED] Failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
 
    // PAYMENT VOIDED
    eventBus.on("PAYMENT_VOIDED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, storeUuid, voidedBy, voidReason } = payload;
    
        logWithContext("warn", "[Event:PAYMENT_VOIDED] Processing", {
            paymentUuid,
            voidedBy,
        });
    
        if (tenantUuid) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    alertType: "ORDER_ISSUE", // Valid AlertType
                    category: "FINANCIAL",
                    level: "WARNING",
                    priority: "MEDIUM",
                    source: "SYSTEM",
                    title: "Payment Voided",
                    message: `Payment voided: ${voidReason}`,
                    context: {
                        subType: "PAYMENT_VOIDED",
                        paymentUuid,
                        orderUuid,
                        voidedBy,
                        voidReason,
                    },
                },
            });
        }
    
        MetricsService.increment("payment.voided", 1, { storeUuid });
    });
 
    // PAYMENT CORRECTED
    eventBus.on("PAYMENT_CORRECTED", async (payload) => {
        const { paymentUuid, tenantUuid, storeUuid, originalAmount, correctedAmount, correctedBy } = payload;
    
        logWithContext("warn", "[Event:PAYMENT_CORRECTED] Processing", {
            paymentUuid,
            originalAmount,
            correctedAmount,
        });
    
        // FIX #5: Use valid AlertType
        if (tenantUuid) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    alertType: "ORDER_ISSUE", // Valid AlertType
                    category: "FINANCIAL",
                    level: "INFO",
                    priority: "LOW",
                    source: "MANUAL",
                    title: "Payment Amount Corrected",
                    message: `Amount changed from ${originalAmount / 100} to ${correctedAmount / 100}`,
                    context: {
                        subType: "PAYMENT_CORRECTED",
                        paymentUuid,
                        originalAmount,
                        correctedAmount,
                        correctedBy,
                    },
                },
            });
        }
    });
 
    // PAYMENT RECONCILED 
    eventBus.on("PAYMENT_RECONCILED", async (payload) => {
        const { paymentUuid, orderUuid, storeUuid } = payload;
    
        logWithContext("info", "[Event:PAYMENT_RECONCILED] Recorded", {
            paymentUuid,
        });
    
        MetricsService.increment("payment.reconciled", 1, { storeUuid });
    });
 
    eventBus.on("REFUND_REQUESTED", async (payload) => {
        const { orderUuid, storeUuid, amount, reason, requestedBy } = payload;
    
        logWithContext("info", "[Event:REFUND_REQUESTED]", { orderUuid, amount });
    
        MetricsService.increment("refund.requested", 1, { storeUuid });
    
        // Fraud signal
        await PaymentFraudEvaluator.evaluate("REFUND_COMPLETED", {
            orderUuid,
            amount,
        });
    });
 
    eventBus.on("REFUND_PROCESSING", async (payload) => {
        const { refundUuid, storeUuid } = payload;
        MetricsService.increment("refund.processing", 1, { storeUuid });
    });
 
    eventBus.on("REFUND_COMPLETED", async (payload) => {
        const { refundUuid, paymentUuid, orderUuid, tenantUuid, storeUuid, amount } = payload;
    
        logWithContext("info", "[Event:REFUND_COMPLETED]", { refundUuid, amount });
    
        // Ledger reversal
        // await LedgerService.record({ type: "REFUND", ... });
    
        // Fraud evaluation
        await PaymentFraudEvaluator.evaluate("REFUND_COMPLETED", {
            orderUuid,
            amount,
            refundUuid,
        });
    
        MetricsService.increment("refund.completed", amount, { storeUuid });
    
        // Send notification
        // await EmailService.sendRefundCompleted(orderUuid, amount);
    });
 
    eventBus.on("REFUND_FAILED", async (payload) => {
        const { refundUuid, orderUuid, storeUuid, reason, tenantUuid } = payload;
    
        logWithContext("error", "[Event:REFUND_FAILED]", { refundUuid, reason });
    
        MetricsService.increment("refund.failed", 1, { storeUuid });
    
        if (tenantUuid) {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    alertType: "PAYMENT_FAILED", // Valid AlertType
                    category: "FINANCIAL",
                    level: "ERROR",
                    priority: "HIGH",
                    source: "SYSTEM",
                    title: "Refund Failed",
                    message: `Refund ${refundUuid} failed: ${reason}`,
                    context: {
                        subType: "REFUND_FAILED",
                        refundUuid,
                        orderUuid,
                        reason,
                    },
                },
            });
        }
    });
 
    // DISPUTE EVENTS
    eventBus.on("DISPUTE_CREATED", async (payload) => {
        const { disputeUuid, paymentUuid, tenantUuid, amount } = payload;

        logWithContext("warn", "[Event:DISPUTE_CREATED]", { disputeUuid, amount });
        MetricsService.increment("dispute.created", 1);
    });
    
    logWithContext("info", "[PaymentEvents] All handlers registered");
}