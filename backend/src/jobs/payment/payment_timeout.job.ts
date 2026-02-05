import prisma from "../../config/prisma.ts"
import { OrderStatusService } from "../../services/order/order-status.service.ts";

export class PaymentTimeoutJob{
    static async run(){
        const cutoff= new Date(Date.now() - 10 * 60 * 1000);
        
        const stuck = await prisma.order.findMany({
            where: {
            status: "PAYMENT_PENDING",
            createdAt: { lt: cutoff },
            },
        });

        for (const order of stuck) {
            await OrderStatusService.transition(
              order.uuid,
              "CANCELLED"
            );
        }
    }
}