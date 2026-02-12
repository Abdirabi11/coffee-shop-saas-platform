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
                    console.log(`[FinalizeOrderJob] Order ${orderUuid} already finalized`);
                    return;
                };

                if (order.status !== "PAYMENT_PENDING") {
                    throw new Error(
                      `Cannot finalize order in status ${order.status}`
                    );
                };

                await OrderStatusService.transition(
                    order.uuid, "PAID", {
                        changedBy: "system",
                        reason: "Payment confirmed",
                    }
                );
                await InventoryCommitJob.run( order.uuid );
            });

            OrderEventBus.emit("ORDER_PAID", { orderUuid,} );
            console.log(`[FinalizeOrderJob] Successfully finalized order: ${orderUuid}`);
        } catch (err: any) {
            console.error(`[FinalizeOrderJob] Failed for ${orderUuid}:`, err.message);
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: { tenantUuid: true, orderNumber: true, storeUuid: true },
            });

            if (order) {
                await DeadLetterQueue.record(
                order.tenantUuid,
                "FINALIZE_ORDER",
                {
                    orderUuid,
                    orderNumber: order.orderNumber,
                    storeUuid: order.storeUuid,
                },
                err.message
                );
            }
            throw err;
        }
    }
};