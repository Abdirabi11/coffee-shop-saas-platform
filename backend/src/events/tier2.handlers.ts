import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { PaymentNotificationService } from "../services/payment/PaymentNotification.service.ts";
import { SettlementService } from "../services/payment/Settlement.service.ts";
import { eventBus } from "./eventBus.ts";

export function registerTier2EventHandlers() {
    // PAYMENT CONFIRMED — notify customer + record pending settlement
    eventBus.on("PAYMENT_CONFIRMED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, storeUuid, amount } = payload;
    
        try {
            // Get user context for notification
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: {
                    orderNumber: true,
                    currency: true,
                    tenantUser: { select: { userUuid: true } },
                    store: { select: { name: true, currency: true } },
                },
            });
        
            if (order?.tenantUser?.userUuid) {
                await PaymentNotificationService.notify({
                    type: "PAYMENT_RECEIPT",
                    tenantUuid,
                    userUuid: order.tenantUser.userUuid,
                    data: {
                        orderNumber: order.orderNumber,
                        amount,
                        currency: order.currency,
                        storeName: order.store?.name,
                    },
                });
            }
    
            // Record pending settlement (only for provider payments, not wallet)
            const payment = await prisma.payment.findUnique({
                where: { uuid: paymentUuid },
                select: { provider: true, providerRef: true, paymentFlow: true, currency: true },
            });
        
            if (payment?.paymentFlow === "PROVIDER" && payment.provider !== "WALLET") {
                await SettlementService.recordPending({
                    tenantUuid,
                    storeUuid,
                    paymentUuid,
                    provider: payment.provider!,
                    providerRef: payment.providerRef!,
                    amount,
                    currency: payment.currency,
                });
            }
        } catch (error: any) {
            logWithContext("error", "[Tier2] PAYMENT_CONFIRMED handler failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
    
    // CASHIER PAYMENT COMPLETED — no settlement tracking (cash/card terminal
    // don't have provider settlement delays), but send notification
    eventBus.on("CASHIER_PAYMENT_COMPLETED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, amount } = payload;
    
        try {
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: {
                    orderNumber: true,
                    currency: true,
                    tenantUser: { select: { userUuid: true } },
                },
            });
    
            // Only notify if customer ordered via app (not walk-in)
            if (order?.tenantUser?.userUuid) {
                await PaymentNotificationService.notify({
                    type: "PAYMENT_RECEIPT",
                    tenantUuid,
                    userUuid: order.tenantUser.userUuid,
                    data: {
                        orderNumber: order.orderNumber,
                        amount,
                        currency: order.currency,
                    },
                });
            }
        } catch (error: any) {
            logWithContext("error", "[Tier2] CASHIER_PAYMENT_COMPLETED handler failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
 
    // PAYMENT FAILED — notify customer to retry
    eventBus.on("PAYMENT_FAILED", async (payload) => {
        const { paymentUuid, orderUuid, tenantUuid, failureReason } = payload;
    
        try {
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: {
                    orderNumber: true,
                    tenantUser: { select: { userUuid: true } },
                },
            });
    
            if (order?.tenantUser?.userUuid) {
                await PaymentNotificationService.notify({
                    type: "PAYMENT_FAILED",
                    tenantUuid,
                    userUuid: order.tenantUser.userUuid,
                    data: {
                        orderNumber: order.orderNumber,
                        reason: failureReason,
                        paymentUuid,
                    },
                });
            }
        } catch (error: any) {
            logWithContext("error", "[Tier2] PAYMENT_FAILED handler failed", {
                paymentUuid,
                error: error.message,
            });
        }
    });
    
    //REFUND COMPLETED — notify customer
    eventBus.on("REFUND_COMPLETED", async (payload) => {
        const { refundUuid, orderUuid, tenantUuid, amount } = payload;
    
        try {
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: {
                    orderNumber: true,
                    currency: true,
                    tenantUser: { select: { userUuid: true } },
                },
            });
    
        if (order?.tenantUser?.userUuid) {
            await PaymentNotificationService.notify({
                type: "REFUND_COMPLETED",
                tenantUuid,
                userUuid: order.tenantUser.userUuid,
                data: {
                    orderNumber: order.orderNumber,
                    amount,
                    currency: order.currency,
                    refundUuid,
                },
            });
        }
        } catch (error: any) {
            logWithContext("error", "[Tier2] REFUND_COMPLETED handler failed", {
                refundUuid,
                error: error.message,
            });
        }
    });
    
    logWithContext("info", "[Tier2] Event handlers registered (notifications + settlement)");
}
 