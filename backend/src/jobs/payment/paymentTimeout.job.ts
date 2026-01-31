import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { InventoryReleaseService } from "../../services/order/inventoryRelease.service.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";

export class PaymentTimeoutJob{
    static async run(){
        const expiredOrders= await prisma.order.findMany({
            where: {
                status: "PAYMENT_PENDING",
                createdAt: {
                    lt: new Date(Date.now() - 15 * 60 * 1000)
                }
            },
            take: 20
        });

        for(const order of expiredOrders){
            await prisma.$transaction(async (tx) => {
                await OrderStatusService.transition(
                    tx, 
                    order.uuid, 
                    "CANCELLED"
                ),

                await InventoryReleaseService.release(
                    tx,
                    order.uuid
                );
            });

            EventBus.emit("PAYMENT_TIMEOUT", {
                orderUuid: order.uuid,
                storeUuid: order.storeUuid,
            });
        }
    }
};