import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import { RefundService } from "../../services/payment/refund.service.ts";

export class RefundProcessorJob{
    static async run(refundUuid: string){
        const refunds= await prisma.refund.findMany({
            where: { status: "REQUESTED"},
            take: 20,
        });

        for (const refund of refunds){
            try {
                EventBus.emit("REFUND_PROCESSING", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    storeUuid: refund.storeUuid,
                });

                await RefundService.processRefund(refundUuid);

                EventBus.emit("REFUND_COMPLETED", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    storeUuid: refund.storeUuid,
                    amount: refund.amount,
                });
            } catch (err:any) {
                await DeadLetterQueue.record("REFUND_PROCESSOR", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    reason: err.message,
                });

                EventBus.emit("REFUND_FAILED", {
                    refundUuid: refund.uuid,
                    orderUuid: refund.orderUuid,
                    storeUuid: refund.storeUuid,
                    reason: err.message,
                });

                console.error("Refund failed", refund.uuid, err);
            }
        }
    }
};