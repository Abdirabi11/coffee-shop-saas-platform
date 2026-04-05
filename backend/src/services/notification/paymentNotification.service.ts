import prisma from "../../config/prisma.js"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EmailService } from "../email.service.ts";

export class PaymentNotificationService{
    static async sendPaymentConfirmation(input: {
        orderUuid: string;
        paymentUuid: string;
        tenantUserUuid: string;
    }){
        try {
            const order = await prisma.order.findUnique({
                where: { uuid: input.orderUuid },
                include: {
                    payment: true,
                    tenantUser: { include: { user: true } },
                    store: true,
                    items: { include: { product: true } },
                },
            });
          
            if (!order || !order.tenantUser?.user) {
                logWithContext("warn", "[PaymentNotification] No user found for payment confirmation", {
                  orderUuid: input.orderUuid,
                });
                return;
            };
        
            const user = order.tenantUser.user;
          
            // Email receipt
            if (user.email) {
                await EmailService.sendPaymentReceipt({
                    to: user.email,
                    subject: `Payment Confirmed - Order #${order.orderNumber}`,
                    template: "payment-receipt",
                    data: {
                        userName: user.name || user.email,
                        orderNumber: order.orderNumber,
                        orderDate: order.createdAt.toLocaleDateString(),
                        items: order.items.map(item => ({
                        name: item.product.name,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.quantity * item.price,
                        })),
                        subtotal: order.subtotal,
                        tax: order.taxAmount,
                        discount: order.discountAmount,
                        total: order.totalAmount,
                        paymentMethod: order.payment?.paymentMethod,
                        storeName: order.store.name,
                        storeAddress: order.store.address,
                    },
                });
    
                //double
                MetricsService.increment("notification.email.sent", 1, {
                    type: "payment_confirmation",
                });
            }
          
              // SMS notification
            if (user.phone) {
                await SMSService.send({
                    to: user.phone,
                    message: `Payment confirmed! Order #${order.orderNumber} - Total: ${order.totalAmount / 100} ${order.currency}`,
                });
    
                MetricsService.increment("notification.sms.sent", 1, {
                    type: "payment_confirmation",
                });
            }
    
            // Push notification
            if (user.uuid) {
                await PushNotificationService.send({
                    userUuid: user.uuid,
                    title: "💳 Payment Confirmed",
                    body: `Your payment for order #${order.orderNumber} was successful!`,
                    data: {
                        type: "PAYMENT_CONFIRMED",
                        orderUuid: order.uuid,
                        paymentUuid: input.paymentUuid,
                        orderNumber: order.orderNumber,
                        amount: order.totalAmount,
                    },
                });
        
                MetricsService.increment("notification.push.sent", 1, {
                    type: "payment_confirmation",
                });
            };

            logWithContext("info", "[PaymentNotification] Payment confirmation sent", {
                orderUuid: input.orderUuid,
                paymentUuid: input.paymentUuid,
                userEmail: user.email,
            });
        } catch (error: any) {
            logWithContext("error", "[PaymentNotification] Failed to send payment confirmation", {
                orderUuid: input.orderUuid,
                error: error.message,
            });
        
            MetricsService.increment("notification.error", 1, {
                type: "payment_confirmation",
            });
        }
    }

    //Send payment failed notification
    static async sendPaymentFailed(input: {
        orderUuid: string;
        paymentUuid: string;
        reason: string;
    }){
        try {
            const order = await prisma.order.findUnique({
                where: { uuid: input.orderUuid },
                include: {
                    tenantUser: { include: { user: true } },
                },
            });
            
            if (!order || !order.tenantUser?.user) return;
            
            const user = order.tenantUser.user;
            
            // Email
            if (user.email) {
                await EmailService.sendPaymentFailed({
                    to: user.email,
                    subject: `Payment Failed - Order #${order.orderNumber}`,
                    template: "payment-failed",
                    data: {
                        userName: user.name || user.email,
                        orderNumber: order.orderNumber,
                        amount: order.totalAmount,
                        currency: order.currency,
                        reason: this.formatFailureReason(input.reason),
                        retryUrl: `${process.env.APP_URL}/orders/${order.uuid}/retry-payment`,
                    },
                });

                //double
                MetricsService.increment("notification.email.sent", 1, {
                    type: "payment_failed",
                });
            };
            
            // SMS
            if (user.phone) {
                await SMSService.send({
                    to: user.phone,
                    message: `Payment failed for order #${order.orderNumber}. Please try again or contact support.`,
                });

                MetricsService.increment("notification.sms.sent", 1, {
                    type: "payment_failed",
                });
            }
        
            // Push notification
            if (user.uuid) {
                await PushNotificationService.send({
                    userUuid: user.uuid,
                    title: "⚠️ Payment Failed",
                    body: `Payment for order #${order.orderNumber} could not be processed.`,
                    data: {
                        type: "PAYMENT_FAILED",
                        orderUuid: order.uuid,
                        paymentUuid: input.paymentUuid,
                        reason: input.reason,
                    },
                });

                MetricsService.increment("notification.push.sent", 1, {
                    type: "payment_failed",
                });
            };

            logWithContext("info", "[PaymentNotification] Payment failed notification sent", {
                orderUuid: input.orderUuid,
                paymentUuid: input.paymentUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[PaymentNotification] Failed to send payment failed notification", {
                orderUuid: input.orderUuid,
                error: error.message,
            });
        
            MetricsService.increment("notification.error", 1, {
                type: "payment_failed",
            });
        }
    }

    //Send refund notification
    static async sendRefundConfirmation(input: {
        refundUuid: string;
        orderUuid: string;
    }) {
      try {
            const refund = await prisma.refund.findUnique({
                where: { uuid: input.refundUuid },
                include: {
                    order: {
                    include: {
                        tenantUser: { include: { user: true } },
                    },
                    },
                },
            });
    
            if (!refund || !refund.order.tenantUser?.user) return;
    
            const user = refund.order.tenantUser.user;
  
            // Email
            if (user.email) {
                await EmailService.send({
                    to: user.email,
                    subject: `Refund Processed - Order #${refund.order.orderNumber}`,
                    template: "refund-confirmation",
                    data: {
                        userName: user.name || user.email,
                        orderNumber: refund.order.orderNumber,
                        refundAmount: refund.amount,
                        currency: refund.currency,
                        reason: refund.reason,
                        processingTime: "3-5 business days",
                    },
                });

                MetricsService.increment("notification.email.sent", 1, {
                    type: "refund_confirmation",
                });
            };

            // SMS
            if (user.phone) {
                await SMSService.send({
                    to: user.phone,
                    message: `Refund processed! ${refund.amount / 100} ${refund.currency} has been refunded to your original payment method.`,
                });

                MetricsService.increment("notification.sms.sent", 1, {
                    type: "refund_confirmation",
                });
            };

            // Push notification
            if (user.uuid) {
                await PushNotificationService.send({
                    userUuid: user.uuid,
                    title: "💰 Refund Processed",
                    body: `Your refund of ${this.formatAmount(refund.amount, refund.currency)} has been processed.`,
                    data: {
                        type: "REFUND_COMPLETED",
                        orderUuid: refund.orderUuid,
                        refundUuid: refund.uuid,
                        amount: refund.amount,
                    },
                });

                MetricsService.increment("notification.push.sent", 1, {
                    type: "refund_confirmation",
                });
            }

            logWithContext("info", "[PaymentNotification] Refund confirmation sent", {
                refundUuid: input.refundUuid,
                orderUuid: input.orderUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[PaymentNotification] Failed to send refund confirmation", {
                refundUuid: input.refundUuid,
                error: error.message,
            });
        
            MetricsService.increment("notification.error", 1, {
                type: "refund_confirmation",
            });
        }
    }
    
    //Format amount for display
    private static formatAmount(amount: number, currency: string): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    }

    //Format failure reason for user display
    private static formatFailureReason(reason: string): string {
        const reasons: Record<string, string> = {
        "CARD_DECLINED": "Your card was declined. Please try a different payment method.",
        "INSUFFICIENT_FUNDS": "Insufficient funds. Please check your account balance.",
        "CARD_EXPIRED": "Your card has expired. Please use a different card.",
        "INVALID_CVV": "Invalid CVV code. Please check your card details.",
        "PROVIDER_UNAVAILABLE": "Payment provider is temporarily unavailable. Please try again later.",
        "FRAUD_SUSPECTED": "Payment blocked for security reasons. Please contact support.",
        "UNKNOWN_ERROR": "An unexpected error occurred. Please try again.",
        };

        return reasons[reason] || "Payment could not be processed. Please try again.";
    }
}

// Wire up event handlers
EventBus.on("PAYMENT_CONFIRMED", async (payload) => {
    await PaymentNotificationService.sendPaymentConfirmation({
        orderUuid: payload.orderUuid,
        paymentUuid: payload.paymentUuid,
        tenantUserUuid: payload.tenantUserUuid,
    });
});
  
EventBus.on("PAYMENT_FAILED", async (payload) => {
    await PaymentNotificationService.sendPaymentFailed({
        orderUuid: payload.orderUuid,
        paymentUuid: payload.paymentUuid,
        reason: payload.failureReason || "Unknown error",
    });
});
  
EventBus.on("REFUND_COMPLETED", async (payload) => {
    await PaymentNotificationService.sendRefundConfirmation({
        refundUuid: payload.refundUuid,
        orderUuid: payload.orderUuid,
    });
});