import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";



// Notification types mapped to templates and content
interface NotificationContent {
    emailTemplate: string;
    emailSubject: string;
    pushTitle: string;
    pushBody: string;
    smsMessage: string;
}
 
const NOTIFICATION_MAP: Record<string, (data: any) => NotificationContent> = {
    PAYMENT_RECEIPT: (data) => ({
        emailTemplate: "receipt",
        emailSubject: `Receipt for Order ${data.orderNumber}`,
        pushTitle: "Payment Confirmed",
        pushBody: `Your order ${data.orderNumber} is confirmed — ${formatCurrency(data.amount, data.currency)}`,
        smsMessage: `Payment confirmed for order ${data.orderNumber}. Amount: ${formatCurrency(data.amount, data.currency)}`,
    }),
 
    PAYMENT_FAILED: (data) => ({
        emailTemplate: "payment-failed",
        emailSubject: `Payment Failed — Order ${data.orderNumber}`,
        pushTitle: "Payment Failed",
        pushBody: `Your payment for order ${data.orderNumber} couldn't be processed. Tap to retry.`,
        smsMessage: `Payment failed for order ${data.orderNumber}. Please try again or use a different payment method.`,
    }),
    
    REFUND_REQUESTED: (data) => ({
        emailTemplate: "refund-requested",
        emailSubject: `Refund Requested — Order ${data.orderNumber}`,
        pushTitle: "Refund in Progress",
        pushBody: `Your refund of ${formatCurrency(data.amount, data.currency)} for order ${data.orderNumber} is being processed.`,
        smsMessage: `Refund of ${formatCurrency(data.amount, data.currency)} requested for order ${data.orderNumber}. We'll notify you when complete.`,
    }),
 
    REFUND_COMPLETED: (data) => ({
        emailTemplate: "refund-completed",
        emailSubject: `Refund Completed — Order ${data.orderNumber}`,
        pushTitle: "Refund Complete",
        pushBody: `Your refund of ${formatCurrency(data.amount, data.currency)} for order ${data.orderNumber} has been processed.`,
        smsMessage: `Refund of ${formatCurrency(data.amount, data.currency)} completed for order ${data.orderNumber}.`,
    }),
    
    ORDER_READY: (data) => ({
        emailTemplate: "order-ready",
        emailSubject: `Your Order ${data.orderNumber} is Ready!`,
        pushTitle: "Order Ready!",
        pushBody: `Your order ${data.orderNumber} is ready for pickup at ${data.storeName}.`,
        smsMessage: `Your order ${data.orderNumber} is ready for pickup at ${data.storeName}.`,
    }),
};
 
export class PaymentNotificationService {
    //MAIN ENTRY POINT — dispatches to all enabled channels
  
    static async notify(input: {
        type: string;
        tenantUuid: string;
        userUuid: string;
        data: Record<string, any>;
    }) {
        try {
            const contentBuilder = NOTIFICATION_MAP[input.type];
            if (!contentBuilder) {
                logWithContext("warn", "[Notification] Unknown type", { type: input.type });
                return;
            }
        
            const content = contentBuilder(input.data);
        
            // Get user info and tenant notification preferences
            const [user, settings] = await Promise.all([
                prisma.user.findUnique({
                    where: { uuid: input.userUuid },
                    select: {
                        email: true,
                        phoneNumber: true,
                        devices: {
                            where: { isActive: true, pushToken: { not: null } },
                            select: { pushToken: true, platform: true },
                        },
                    },
                }),
                prisma.tenantSettings.findUnique({
                    where: { tenantUuid: input.tenantUuid },
                    select: {
                        emailNotifications: true,
                        pushNotifications: true,
                        smsNotifications: true,
                    },
                }),
            ]);
    
            if (!user) {
                logWithContext("warn", "[Notification] User not found", {
                    userUuid: input.userUuid,
                });
                return;
            }
        
            const channels = settings ?? {
                emailNotifications: true,
                pushNotifications: true,
                smsNotifications: false,
            };
        
            // Dispatch to each enabled channel in parallel
            const promises: Promise<void>[] = [];
        
            if (channels.emailNotifications && user.email) {
                promises.push(
                    this.sendEmail({
                        to: user.email,
                        subject: content.emailSubject,
                        template: content.emailTemplate,
                        data: input.data,
                        type: input.type,
                    })
                );
            }
        
            if (channels.pushNotifications && user.devices.length > 0) {
                for (const device of user.devices) {
                    promises.push(
                        this.sendPush({
                            userUuid: input.userUuid,
                            deviceToken: device.pushToken!,
                            platform: device.platform,
                            title: content.pushTitle,
                            body: content.pushBody,
                            data: {
                                type: input.type,
                                ...input.data,
                            },
                        })
                    );
                }
            };
        
            if (channels.smsNotifications && user.phoneNumber) {
                promises.push(
                    this.sendSMS({
                        to: user.phoneNumber,
                        message: content.smsMessage,
                    })
                );
            }
        
            await Promise.allSettled(promises);
        
            logWithContext("info", "[Notification] Dispatched", {
                type: input.type,
                userUuid: input.userUuid,
                channels: {
                    email: channels.emailNotifications && !!user.email,
                    push: channels.pushNotifications && user.devices.length > 0,
                    sms: channels.smsNotifications && !!user.phoneNumber,
                },
            });
        } catch (error: any) {
            // Never throw — notification failure should not affect payment flow
            logWithContext("error", "[Notification] Dispatch failed", {
                type: input.type,
                userUuid: input.userUuid,
                error: error.message,
            });
        }
    }
 
    //Email via existing EmailOutbox
    private static async sendEmail(input: {
        to: string;
        subject: string;
        template: string;
        data: Record<string, any>;
        type: string;
    }) {
        await prisma.emailOutbox.create({
            data: {
                to: input.to,
                subject: input.subject,
                template: input.template,
                payload: {
                    type: input.type,
                    ...input.data,
                },
                status: "PENDING",
                priority: "NORMAL",
            },
        });
    }
 
    //Push via existing PushNotificationOutbox
    private static async sendPush(input: {
        userUuid: string;
        deviceToken: string;
        platform: string;
        title: string;
        body: string;
        data: Record<string, any>;
    }) {
        await prisma.pushNotificationOutbox.create({
            data: {
                userUuid: input.userUuid,
                deviceToken: input.deviceToken,
                platform: input.platform,
                title: input.title,
                body: input.body,
                data: input.data,
                priority: "NORMAL",
                status: "PENDING",
            },
        });
    }
    
    //SMS via existing SMSOutbox
    private static async sendSMS(input: { to: string; message: string }) {
        await prisma.sMSOutbox.create({
            data: {
                to: input.to,
                message: input.message,
                priority: "NORMAL",
                status: "PENDING",
            },
        });
    }
}

function formatCurrency(amount: number, currency: string = "USD"): string {
    const symbol = currency === "USD" ? "$" : currency;
    return `${symbol}${(amount / 100).toFixed(2)}`;
}