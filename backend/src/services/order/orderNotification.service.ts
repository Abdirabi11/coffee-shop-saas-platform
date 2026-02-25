import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.js";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EmailService } from "../email.service.ts";



export class OrderNotificationService {
    //Send order confirmation notification
    static async sendOrderConfirmation(input: {
      orderUuid: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                items: {
                    include: { product: true },
                },
                tenantUser: {
                    include: { user: true },
                },
                store: true,
            },
        });
      
        if (!order || !order.tenantUser?.user) {
            logWithContext("warn", "[OrderNotification] User not found for order", {
                orderUuid: input.orderUuid,
            });
            return;
        };
      
        const user = order.tenantUser.user;
      
        // Email
        if (user.email) {
            await EmailService.send({
                to: user.email,
                subject: `Order Confirmed - #${order.orderNumber}`,
                template: "order-confirmation",
                data: {
                    userName: user.name || user.email,
                    orderNumber: order.orderNumber,
                    orderDate: order.createdAt.toLocaleDateString(),
                    items: order.items.map((item) => ({
                        name: item.productName,
                        quantity: item.quantity,
                        price: item.unitPrice,
                        total: item.finalPrice,
                    })),
                    subtotal: order.subtotal,
                    tax: order.taxAmount,
                    discount: order.discountAmount,
                    total: order.totalAmount,
                    currency: order.currency,
                    orderType: order.orderType,
                    estimatedReadyAt: order.estimatedReadyAt?.toLocaleTimeString(),
                    storeName: order.store.name,
                    storeAddress: order.store.address,
                },
            });
        }
      
        // SMS
        if (user.phoneNumber) {
            const readyTime = order.estimatedReadyAt
              ? ` Ready by ${order.estimatedReadyAt.toLocaleTimeString()}`
              : "";
      
            await SMSService.send({
                to: user.phoneNumber,
                message: `✅ Order #${order.orderNumber} confirmed! Total: ${this.formatAmount(order.totalAmount, order.currency)}.${readyTime} - ${order.store.name}`,
            });
        };
      
        // Push notification
        if (user.uuid) {
            await PushNotificationService.send({
                userUuid: user.uuid,
                title: "Order Confirmed! 🎉",
                body: `Order #${order.orderNumber} - Total: ${this.formatAmount(order.totalAmount, order.currency)}`,
                data: {
                    type: "ORDER_CONFIRMED",
                    orderUuid: order.uuid,
                    orderNumber: order.orderNumber,
                },
            });
        };
      
        logWithContext("info", "[OrderNotification] Order confirmation sent", {
            orderUuid: order.uuid,
            orderNumber: order.orderNumber,
        });
    }

    //Send order ready notification
    static async sendOrderReady(input: {
        orderUuid: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                tenantUser: { include: { user: true } },
                store: true,
            },
        });

        if (!order || !order.tenantUser?.user) return;

        const user = order.tenantUser.user;

        // Email
        if (user.email) {
            await EmailService.send({
                to: user.email,
                subject: `Order Ready for Pickup - #${order.orderNumber}`,
                template: "order-ready",
                data: {
                userName: user.name || user.email,
                orderNumber: order.orderNumber,
                orderType: order.orderType,
                storeName: order.store.name,
                storeAddress: order.store.address,
                },
            });
        }

        // SMS
        if (user.phoneNumber) {
            await SMSService.send({
                to: user.phoneNumber,
                message: `🔔 Your order #${order.orderNumber} is ready for pickup at ${order.store.name}!`,
            });
        };

        // Push notification (PRIORITY - this is time-sensitive)
        if (user.uuid) {
            await PushNotificationService.send({
                userUuid: user.uuid,
                title: "Order Ready! 🎉",
                body: `Your order #${order.orderNumber} is ready for pickup`,
                data: {
                type: "ORDER_READY",
                orderUuid: order.uuid,
                orderNumber: order.orderNumber,
                storeUuid: order.storeUuid,
                },
                priority: "HIGH",
            });
        }

        logWithContext("info", "[OrderNotification] Order ready notification sent", {
            orderUuid: order.uuid,
        });
    }

    //Send order cancelled notification
    static async sendOrderCancelled(input: {
        orderUuid: string;
        reason: string;
    }) {
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
            await EmailService.send({
                to: user.email,
                subject: `Order Cancelled - #${order.orderNumber}`,
                template: "order-cancelled",
                data: {
                    userName: user.name || user.email,
                    orderNumber: order.orderNumber,
                    reason: input.reason,
                    totalAmount: order.totalAmount,
                    currency: order.currency,
                    willRefund: order.paymentStatus === "PAID",
                },
            });
        };

        // SMS
        if (user.phoneNumber) {
            const refundMsg = order.paymentStatus === "PAID" ? " Refund will be processed." : "";
            await SMSService.send({
                to: user.phoneNumber,
                message: `❌ Order #${order.orderNumber} cancelled.${refundMsg} ${input.reason}`,
            });
        };

        // Push notification
        if (user.uuid) {
            await PushNotificationService.send({
                userUuid: user.uuid,
                title: "Order Cancelled",
                body: `Order #${order.orderNumber} has been cancelled`,
                data: {
                type: "ORDER_CANCELLED",
                orderUuid: order.uuid,
                reason: input.reason,
                },
            });
        };
    }

    //Send order status update notification
    static async sendStatusUpdate(input: {
        orderUuid: string;
        oldStatus: string;
        newStatus: string;
    }) {
        // Only send for important status changes
        const notifiableStatuses = ["PREPARING", "READY", "COMPLETED"];
        
        if (!notifiableStatuses.includes(input.newStatus)) {
            return;
        }

        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                tenantUser: { include: { user: true } },
            },
        });

        if (!order || !order.tenantUser?.user) return;

        const user = order.tenantUser.user;
        const statusMessages: Record<string, string> = {
            PREPARING: "Your order is being prepared",
            READY: "Your order is ready for pickup",
            COMPLETED: "Your order is complete",
        };

        const message = statusMessages[input.newStatus];

        // Push notification only (less intrusive for status updates)
        if (user.uuid) {
            await PushNotificationService.send({
                userUuid: user.uuid,
                title: `Order #${order.orderNumber}`,
                body: message,
                data: {
                type: "ORDER_STATUS_UPDATED",
                orderUuid: order.uuid,
                status: input.newStatus,
                },
            });
        };
    }

   //Notify kitchen staff about new order
    static async notifyKitchen(input: {
        orderUuid: string;
    }) {
        const order = await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: {
                items: {
                include: { product: true },
                },
            },
        });

        if (!order) return;

        // Get kitchen staff for this store
        const kitchenStaff = await prisma.tenantUser.findMany({
            where: {
                tenantUuid: order.tenantUuid,
                role: { in: ["MANAGER", "CHEF"] },
                // Optionally filter by store access
            },
            include: { user: true },
        });

        for (const staff of kitchenStaff) {
            if (staff.user.uuid) {
                await PushNotificationService.send({
                userUuid: staff.user.uuid,
                title: "New Order! 🔔",
                body: `Order #${order.orderNumber} - ${order.items.length} items`,
                data: {
                    type: "KITCHEN_NEW_ORDER",
                    orderUuid: order.uuid,
                    orderNumber: order.orderNumber,
                    itemCount: order.items.length,
                },
                priority: "HIGH",
                });
            };
        };
    }

   //Format amount for display
    private static formatAmount(amount: number, currency: string): string {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    }
}

EventBus.on("ORDER_CREATED", async (payload) => {
    await OrderNotificationService.sendOrderConfirmation({
        orderUuid: payload.orderUuid,
    });
    
    await OrderNotificationService.notifyKitchen({
        orderUuid: payload.orderUuid,
    });
});
  
EventBus.on("ORDER_STATUS_CHANGED", async (payload) => {
    if (payload.to === "READY") {
        await OrderNotificationService.sendOrderReady({
            orderUuid: payload.orderUuid,
        });
    }
  
    await OrderNotificationService.sendStatusUpdate({
        orderUuid: payload.orderUuid,
        oldStatus: payload.from,
        newStatus: payload.to,
    });
});
  
EventBus.on("ORDER_CANCELLED", async (payload) => {
    await OrderNotificationService.sendOrderCancelled({
        orderUuid: payload.orderUuid,
        reason: payload.reason,
    });
});
  