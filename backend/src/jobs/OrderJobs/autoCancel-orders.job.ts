import prisma from "../config/prisma.ts"
import { OrderStatusService } from "../../services/order/order-status.service.js";

const AUTO_CANCEL_MINUTES = 15;

export class AutoCancelOrdersJob{
    static async run(){
        const cutoff= new Date(  Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000 );

        const orders= await prisma.order.findMany({
            where: {
                status: { in: ["PENDING", "PAYMENT_PENDING"], },
                createdAt: { lt: cutoff },
            },
            select: { uuid: true },
        })

        for (const {uuid} of orders) {
            try {
                await OrderStatusService.transition(uuid,  "CANCELLED");
            } catch (err) {
                console.error(`Auto-cancel failed for ${uuid}`, err);
            }
        }
    }
};