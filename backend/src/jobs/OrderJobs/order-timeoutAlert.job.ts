import prisma from "../../config/prisma.ts"
import { NotificationService } from "../../services/notification.service.ts";

const PREPARING_TIMEOUT_MINUTES = 30;

export class OrderTimeoutAlertJob{
    static async run (){
        const cutoff = new Date( Date.now() - PREPARING_TIMEOUT_MINUTES * 60 * 1000 );
        const stuckOrders = await prisma.order.findMany({
            where: {
              status: "PREPARING",
              updatedAt: { lt: cutoff },
            },
            select: {
                uuid: true,
                tenantUuid: true,
                storeUuid: true,
                orderNumber: true,
                updatedAt: true,
            },
        });
        console.log(`[OrderTimeoutAlertJob] Found ${stuckOrders.length} delayed orders`);

        for (const order of stuckOrders) {
            const minutesDelayed = Math.floor(
                (Date.now() - order.updatedAt.getTime()) / 60000
            );
        
            await NotificationService.alertStaff(order.storeUuid, {
                type: "ORDER_DELAY",
                orderUuid: order.uuid,
                orderNumber: order.orderNumber,
                minutesDelayed,
            });

            await prisma.adminAlert.create({
                data: {
                  tenantUuid: order.tenantUuid,
                  storeUuid: order.storeUuid,
                  alertType: "ORDER_ISSUE",
                  category: "OPERATIONAL",
                  level: "WARNING",
                  priority: "MEDIUM",
                  title: "Order Preparation Delayed",
                  message: `Order ${order.orderNumber} has been preparing for ${minutesDelayed} minutes`,
                  affectedEntity: "order",
                  affectedEntityId: order.uuid,
                  context: {
                    minutesDelayed,
                  },
                },
            });
        }
    }
};