import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { RefundService } from "../../services/payment/refund.service.ts";

export class OrderAutoRefundJob{
    static async run(
        orderUuid: string, 
        reason: "ORDER_CANCELLED" | "SLA_BREACH"
    ){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid},
            include: { refunds: true },
        });

        if (!order || order.status !== "PAID") return;

        const alreadyRefunded = order.refunds.some(
            r => r.status === "REQUESTED" || r.status === "COMPLETED"
        );
      
        if (alreadyRefunded) return;

        await RefundService.requestRefund({
            orderUuid,
            reason,
            requestedBy: "SYSTEM",
        });

        // EventBus.emit("AUTO_REFUND_TRIGGERED", {
        //     orderUuid,
        //     storeUuid: order.storeUuid,
        //     reason,
        // });
    }
};