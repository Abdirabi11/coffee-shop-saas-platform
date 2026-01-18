import prisma from "../config/prisma.ts"
import { OrderStatusService } from "../services/order/order-status.service.ts";

const AUTO_COMPLETE_MINUTES = 20;

export class AutoCompleteOrdersJob{
    static async run(){
        const cutoff= new Date(
            Date.now() - AUTO_COMPLETE_MINUTES * 60 * 1000
        );

        const orders = await prisma.order.findMany({
            where: {
              status: "READY",
              updatedAt: { lt: cutoff },
            },
            select: { uuid: true },
        });

        for (const {uuid} of orders) {
            try {
                await OrderStatusService.transition(uuid, "COMPLETED");
            } catch (err) {
                console.error(`Auto-complete failed for ${uuid}`, err);
            }
            
        }
    }
};