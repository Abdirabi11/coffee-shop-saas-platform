import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { EmailService } from "../email.service.ts";

export class PaymentNotificationService{
    static async sendPaymentConfirmation(input: {
        orderUuid: string;
        paymentUuid: string;
        tenantUserUuid: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                payment: true,
                tenantUser: { include: { user: true } },
                store: true,
            },
        });
      
        if (!order || !order.tenantUser?.user) return;
    
        const user = order.tenantUser.user;
      
        // Email receipt
        if (user.email) {
            await EmailService.sendPaymentReceipt({
                to: user.email,
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                currency: order.currency,
                paymentMethod: order.payment?.paymentMethod,
                storeName: order.store.name,
            });
        }
      
          // SMS notification
        if (user.phone) {
            await SMSService.send({
                to: user.phone,
                message: `Payment confirmed! Order #${order.orderNumber} - Total: ${order.totalAmount / 100} ${order.currency}`,
            });
        }
      
        // Push notification
        await PushNotificationService.send({
            userUuid: user.uuid,
            title: "Payment Confirmed",
            body: `Your payment for order #${order.orderNumber} was successful!`,
            data: {
                type: "PAYMENT_CONFIRMED",
                orderUuid: order.uuid,
                paymentUuid: input.paymentUuid,
            },
        });
    }
    //Send payment failed notification
    static async sendPaymentFailed(input: {
        orderUuid: string;
        paymentUuid: string;
        reason: string;
    }){
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
                orderNumber: order.orderNumber,
                reason: input.reason,
            });
        }
        
            // SMS
        if (user.phone) {
            await SMSService.send({
                to: user.phone,
                message: `Payment failed for order #${order.orderNumber}. Please try again or contact support.`,
            });
        }
    
        // Push notification
        await PushNotificationService.send({
            userUuid: user.uuid,
            title: "Payment Failed",
            body: `Payment for order #${order.orderNumber} could not be processed. Please try again.`,
            data: {
                type: "PAYMENT_FAILED",
                orderUuid: order.uuid,
                paymentUuid: input.paymentUuid,
            },
        });
    }

    //Send refund notification
    static async sendRefundConfirmation(input: {
        refundUuid: string;
        orderUuid: string;
    }) {
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
            await EmailService.sendRefundConfirmation({
                to: user.email,
                orderNumber: refund.order.orderNumber,
                amount: refund.amount,
                currency: refund.currency,
            });
        };

        // SMS
        if (user.phone) {
            await SMSService.send({
                to: user.phone,
                message: `Refund processed! ${refund.amount / 100} ${refund.currency} has been refunded to your original payment method.`,
            });
        };
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