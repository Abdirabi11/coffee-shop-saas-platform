import prisma from "../../config/prisma.ts"
import { NotificationService } from "../../services/notification.service.ts";

export class OrderNotificationJob{
    static async orderReady(orderUuid: string){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            include: {  tenantUser: { include: { user: true } }, },
        });
        if (!order){
            console.error(`[OrderNotificationJob] Order not found: ${orderUuid}`);
            return;
        };

        const email = order.tenantUser?.user?.email;
        if (!email) {
            console.error(`[OrderNotificationJob] No email for order: ${orderUuid}`);
            return;
        };

        await prisma.emailOutbox.create({
            data: {
              tenantUuid: order.tenantUuid,
              storeUuid: order.storeUuid,
              to: [email],
              subject: "Your Order is Ready!",
              templateKey: "order_ready",
              templateData: {
                orderNumber: order.orderNumber,
                orderUuid: order.uuid,
                customerName: order.customerName,
              },
              priority: "HIGH",
            },
        });
        console.log(`[OrderNotificationJob] Queued ORDER_READY notification for ${orderUuid}`);
    }

    static async paymentFailed(orderUuid: string){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            include: { tenantUser: { include: { user: true }, }, }
        })
        if (!order) return;
        const email = order.tenantUser?.user?.email;
        if (!email) return;

        await prisma.emailOutbox.create({
            data: {
              tenantUuid: order.tenantUuid,
              storeUuid: order.storeUuid,
              to: [email],
              subject: "Payment Failed for Your Order",
              templateKey: "payment_failed",
              templateData: {
                orderNumber: order.orderNumber,
                orderUuid: order.uuid,
                totalAmount: order.totalAmount,
                currency: order.currency,
              },
              priority: "HIGH",
            },
        });
      
        console.log(`[OrderNotificationJob] Queued PAYMENT_FAILED notification for ${orderUuid}`);
    }

    static async adminAlert(message: string, metadata?: any) {
        await NotificationService.broadcastAdmins({
          type: "ADMIN_ALERT",
          payload: { message, metadata },
        });
    }
};