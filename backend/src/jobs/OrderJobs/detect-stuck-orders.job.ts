import { OrderEventBus } from "../../events/order.events.ts";
import prisma from "../config/prisma.ts"

const STUCK_MINUTES = 60;

export class DetectStuckOrdersJob{
    static async run(){
        const cutoff= new Date( Date.now() - STUCK_MINUTES * 60 * 1000 );
        const stuckOrders= await prisma.order.findMany({
            where: {
                status: "PAID",
                updatedAt: { lt: cutoff}
            },
            select: {
                uuid: true,
                tenantUuid: true,
                storeUuid: true,
                orderNumber: true,
                createdAt: true,
                updatedAt: true,
            }
        });
        console.log(`[DetectStuckOrdersJob] Found ${stuckOrders.length} stuck orders`);
        
        for (const order of stuckOrders) {
            const minutesStuck = Math.floor(
                (Date.now() - order.updatedAt.getTime()) / 60000
            );
            // Emit event for monitoring/alerting
            OrderEventBus.emit("ORDER_STUCK", {
                orderUuid: order.uuid,
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                orderNumber: order.orderNumber,
                minutesStuck,
            });

            await prisma.adminAlert.create({
                data: {
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    alertType: "ORDER_ISSUE",
                    category: "OPERATIONAL",
                    level: "WARNING",
                    priority: "HIGH",
                    title: "Order Stuck in Processing",
                    message: `Order ${order.orderNumber} has been stuck in PAID status for ${minutesStuck} minutes`,
                    affectedEntity: "order",
                    affectedEntityId: order.uuid,
                    context: {
                      orderUuid: order.uuid,
                      minutesStuck,
                      createdAt: order.createdAt,
                      updatedAt: order.updatedAt,
                    },
                },
            })
        }
    }
};