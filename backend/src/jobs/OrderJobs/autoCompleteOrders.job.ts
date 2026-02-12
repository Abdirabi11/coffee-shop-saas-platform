import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.js";
import prisma from "../config/prisma.ts"
import { OrderStatusService } from "../services/order/order-status.service.ts";

const AUTO_COMPLETE_MINUTES = 20;

export class AutoCompleteOrdersJob{
    static async run(){
        const cutoff= new Date( Date.now() - AUTO_COMPLETE_MINUTES * 60 * 1000 );

        const orders = await prisma.order.findMany({
            where: {
              status: "READY",
              actualReadyAt: { lt: cutoff }, 
            },
            select: { 
                uuid: true,
                tenantUuid: true,
                storeUuid: true,
                orderNumber: true,
             },
        });

        console.log(`[AutoCompleteOrdersJob] Found ${orders.length} orders to auto-complete`);

        let completed = 0;
        let failed = 0;

        for (const order of orders) {
            try {
                await OrderStatusService.transition(order.uuid, "COMPLETED", {
                    changedBy: "system",
                    reason: "Auto-completed after 30 minutes in READY status",
                });
                completed++;
            } catch (err: any) {
                console.error(`Auto-complete failed for ${order.uuid}:`, err.message);
                await DeadLetterQueue.record(
                    order.tenantUuid,
                    "AUTO_COMPLETE_ORDER",
                    {
                        orderUuid: order.uuid,
                        orderNumber: order.orderNumber,
                        storeUuid: order.storeUuid,
                    },
                    err.message
                );
                failed++;
            };   
        }
        console.log(`[AutoCompleteOrdersJob] Completed: ${completed}, Failed: ${failed}`);
    }
};