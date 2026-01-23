import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import { RefundService } from "../../services/payment/refund.service.ts";

export class RefundProcessorJob{
    static async run(){
        const refunds= await prisma.refund.findMany({
            where: { status: "REQUESTED"},
            take: 20,
        });

        for (const refund of refunds){
            try {
                await RefundService.processRefund(refund.uuid);
            } catch (err:any) {
                await DeadLetterQueue.record("REFUND_PROCESSOR", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    reason: err.message,
                });

                EventBus.emit("REFUND_FAILED", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                });

                console.error("Refund failed", refund.uuid, err);
            }
        }
    }
};