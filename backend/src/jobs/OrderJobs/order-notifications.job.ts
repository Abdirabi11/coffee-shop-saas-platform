import prisma from "../../config/prisma.ts"
import { NotificationService } from "../../services/notification.service.ts";

export class OrderNotificationJob{
    static async orderReady(orderUuid: string){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            include: { user: true },
        });
        if (!order) return;

        NotificationService.send({
            to: order.user.email,
            type: "ORDER_READY",
            payload: {
                orderUuid: order.uuid,
            },
        })
    }

    static async paymentFailed(orderUuid: string){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            include: {user: true}
        })
        if (!order) return;

        NotificationService.send({
            to: order.user.email,
            type: "PAYMENT_FAILED",
            payload: {
                orderUuid: order.uuid,
            },
        });
    }

    static async adminAlert(message: string) {
        NotificationService.broadcastAdmins({
          type: "ADMIN_ALERT",
          payload: { message },
        });
    }
};