import prisma from "../../config/prisma.ts"
import { OrderEventBus } from "../../events/order.events.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";
import { InventoryCommitJob } from "./inventory_commit.job.ts";

export class FinalizeOrderJob{
    static async run(orderUuid: string){
        try {
            await prisma.$transaction(async (tx) =>{
                const order= await tx.order.findUnique({
                    where: { uuid: orderUuid},
                    include: { items: true }
                });
                if(!order) throw new Error("Order not found");

                if (order.status === "PAID" || order.status === "PREPARING") {
                    return;
                };

                if (order.status !== "PAYMENT_PENDING") {
                    throw new Error(
                      `Cannot finalize order in status ${order.status}`
                    );
                };

                await OrderStatusService.transition(order.uuid, "PAID", tx);

                await InventoryCommitJob.run(tx, order.uuid);
            });

            OrderEventBus.emit("ORDER_PAID", { orderUuid });
        } catch (err) {
            await DeadLetterQueue.record("FINALIZE_ORDER", {
                orderUuid,
                reason: err.message,
            });
            throw err;
        }
    }
};