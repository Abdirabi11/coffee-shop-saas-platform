import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"
import { RefundService } from "../../services/payment/Refund.service.ts";
import { eventBus } from "../../events/eventBus.ts";

export class AutoRefundJob {
    static async run(
        orderUuid: string,
        reason: "ORDER_CANCELLED" | "SLA_BREACH"
    ) {
        logWithContext("info", "[AutoRefund] Triggered", { orderUuid, reason });
    
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: {
                payment: true,
                refunds: true,
            },
        });
    
        if (!order) {
            logWithContext("warn", "[AutoRefund] Order not found", { orderUuid });
            return;
        }
    
        if (order.payment?.status !== "PAID" && order.payment?.status !== "COMPLETED") {
            logWithContext("info", "[AutoRefund] Order not in refundable state", {
                orderUuid,
                paymentStatus: order.payment?.status,
            });
            return;
        }
    
        // Check if already refunded
        const alreadyRefunded = order.refunds.some(
            (r) => r.status === "REQUESTED" || r.status === "PROCESSING" || r.status === "COMPLETED"
        );
    
        if (alreadyRefunded) {
            logWithContext("info", "[AutoRefund] Refund already exists", { orderUuid });
            return;
        }
    
        try {
            await RefundService.requestRefund({
                orderUuid,
                reason: `Auto-refund: ${reason}`,
                requestedBy: "SYSTEM",
            });
    
            eventBus.emit("AUTO_REFUND_TRIGGERED", {
                orderUuid,
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                amount: order.payment!.amount,
                reason,
            });
        
            logWithContext("info", "[AutoRefund] Refund requested", {
                orderUuid,
                amount: order.payment!.amount,
            });
        } catch (error: any) {
            logWithContext("error", "[AutoRefund] Failed", {
                orderUuid,
                error: error.message,
            });
        
            // Dead letter for manual investigation
            await prisma.deadLetterJob.create({
                data: {
                    jobName: "AUTO_REFUND",
                    payload: { orderUuid, reason },
                    error: error.message,
                    status: "FAILED",
                },
            });
        }
    }
}