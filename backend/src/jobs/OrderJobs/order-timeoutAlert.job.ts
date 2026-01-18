import prisma from "../../config/prisma.ts"
import { NotificationService } from "../../services/notification.service.ts";

const PREPARING_TIMEOUT_MINUTES = 10;

export class OrderTimeoutAlertJob{
    static async run (){
        const cutoff = new Date(
            Date.now() - PREPARING_TIMEOUT_MINUTES * 60 * 1000
        );
        const stuckOrders = await prisma.order.findMany({
            where: {
              status: "PREPARING",
              updatedAt: { lt: cutoff },
            },
        });

        for (const order of stuckOrders) {
            await NotificationService.alertStaff(order.storeUuid, {
              type: "ORDER_DELAY",
              orderUuid: order.uuid,
            });
        }
    }
};