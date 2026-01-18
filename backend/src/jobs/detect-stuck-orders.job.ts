import prisma from "../config/prisma.ts"
import { EventBus } from "../events/eventBus.ts";

const STUCK_MINUTES = 10;

export class DetectStuckOrdersJob{
    static async run(){
        const cutoff= new Date(
            Date.now() - STUCK_MINUTES * 60 * 1000
        );
        const stuckOrders= await prisma.order.findMany({
            where: {
                status: "PAID",
                updatedAt: { lt: cutoff}
            },
            select: {
                uuid: true,
                storeUuid: true
            }
        });
        
        for (const order of stuckOrders) {
            EventBus.emit("ORDER_STUCK", {
              orderUuid: order.uuid,
              storeUuid: order.storeUuid,
            });
        }
    }
}