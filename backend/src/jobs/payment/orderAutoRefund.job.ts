import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { RefundService } from "../../services/payment/refund.service.ts";

export class OrderAutoRefundJob{
    static async run(orderUuid: string, reason: "ORDER_CANCELLED" | "SLA_BREACH"){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid}
        });

        if (!order || order.status !== "PAID") return;

        await RefundService.requestRefund({
            orderUuid,
            reason,
            requestedBy: "SYSTEM",
        });

        EventBus.emit("AUTO_REFUND_TRIGGERED", {
            orderUuid,
            storeUuid: order.storeUuid,
            reason,
        });
    }
};