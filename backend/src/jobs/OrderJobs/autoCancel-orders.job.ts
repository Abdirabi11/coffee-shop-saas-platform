import prisma from "../config/prisma.ts"
import { OrderStatusService } from "../../services/order/order-status.service.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.js";

const AUTO_CANCEL_MINUTES = 15;

export class AutoCancelOrdersJob{
    static async run(){
        const cutoff= new Date(  Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000 );

        const orders= await prisma.order.findMany({
            where: {
                status: { in: ["PENDING", "PAYMENT_PENDING"], },
                createdAt: { lt: cutoff },
            },
            select: { 
                uuid: true,
                tenantUuid: true,
                storeUuid: true,
                orderNumber: true,
                status: true,
             },
        });
        console.log(`[AutoCancelOrdersJob] Found ${orders.length} orders to auto-cancel`);

        let cancelled = 0;
        let failed = 0;

        for (const order of orders) {
            try {
                await OrderStatusService.transition(order.uuid, "CANCELLED", {
                    changedBy: "system",
                    reason: `Auto-cancelled: No payment received within ${AUTO_CANCEL_MINUTES} minutes`,
                });
                cancelled++;
            } catch (err: any) {
                console.error(`Auto-cancel failed for ${order.uuid}:`, err.message);
                await DeadLetterQueue.record(
                    order.tenantUuid,
                    "AUTO_CANCEL_ORDER",
                    {
                        orderUuid: order.uuid,
                        orderNumber: order.orderNumber,
                        storeUuid: order.storeUuid,
                        currentStatus: order.status,
                    },
                    err.message
                );
                failed++;
            }
        };
        console.log(`[AutoCancelOrdersJob] Cancelled: ${cancelled}, Failed: ${failed}`);
    }
};