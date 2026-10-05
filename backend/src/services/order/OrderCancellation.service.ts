import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { RefundService } from "../payment/Refund.service.ts";
import { OrderStatusService, REFUND_ON_CANCEL } from "./OrderStatus.service.ts";

interface CancelInput {
    tenantUuid: string;
    orderUuid: string;
    reason: string;
    cancelledBy: string; // User UUID or "SYSTEM"
}

// BEFORE_PAYMENT: only unpaid orders (the expiry jobs must never cancel a
// paid order). AFTER_PAYMENT: only paid orders. ANY: decided under the lock.
type CancelPhase = "BEFORE_PAYMENT" | "AFTER_PAYMENT" | "ANY";

export class OrderCancellationService{
    static cancelBeforePayment(input: CancelInput) {
        return this.cancel({ ...input, expect: "BEFORE_PAYMENT" });
    }

    static cancelAfterPayment(input: CancelInput) {
        return this.cancel({ ...input, expect: "AFTER_PAYMENT" });
    }

    // The order row is locked and its status re-read inside the transaction,
    // so a cancellation and a payment confirmation (which locks Payment, then
    // Order) serialize:
    // - confirmation commits first: the order is PAID here, so it's either
    //   rejected (BEFORE_PAYMENT) or cancelled with a refund
    // - cancellation commits first: the confirmation finds a CANCELLED order
    //   and auto-refunds it (PaymentService ORDER_NOT_PAYABLE)
    // Whether a refund is needed comes from the order status, not
    // paymentStatus (payments write COMPLETED, not PAID).
    static async cancel(input: CancelInput & { expect?: CancelPhase }) {
        const expect = input.expect ?? "ANY";

        const { order, refundRequired } = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "uuid" = ${input.orderUuid} AND "tenantUuid" = ${input.tenantUuid} FOR UPDATE`;

            const order = await tx.order.findFirst({
                where: { uuid: input.orderUuid, tenantUuid: input.tenantUuid },
            });
            if (!order) {
                throw new Error("ORDER_NOT_FOUND");
            };

            if (!OrderStatusService.canTransition(order.status, "CANCELLED")) {
                throw new Error(`ORDER_NOT_CANCELLABLE: ${order.status}`);
            };

            const refundRequired = REFUND_ON_CANCEL.has(order.status);
            if (expect === "BEFORE_PAYMENT" && refundRequired) {
                throw new Error("CANNOT_CANCEL_PAID_ORDER");
            };
            if (expect === "AFTER_PAYMENT" && !refundRequired) {
                throw new Error("ORDER_NOT_PAID");
            };

            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancelledBy: input.cancelledBy,
                    cancellationReason: input.reason,
                },
            });

            // Releases ACTIVE reservations only. For a paid order they were
            // already committed (sold); that stock comes back when the refund
            // completes (REFUND_COMPLETED listener in inventory.handlers.ts).
            await InventoryOrderService.releaseForOrder({
                orderUuid: order.uuid,
                tx,
            });

            if (!refundRequired) {
                await tx.orderItem.updateMany({
                    where: { orderUuid: order.uuid },
                    data: { inventoryReleased: true },
                });
            };

            await tx.orderStatusHistory.create({
                data:{
                    tenantUuid: order.tenantUuid,
                    orderUuid: order.uuid,
                    fromStatus: order.status,
                    toStatus: "CANCELLED",
                    changedBy: input.cancelledBy,
                    reason: input.reason,
                },
            });

            return { order, refundRequired };
        });

        // Requested directly rather than via ORDER_CANCELLED_AFTER_PAYMENT:
        // that listener (handlers/order/order.handlers.ts) isn't registered,
        // and registering it as well would request the refund twice.
        if (refundRequired) {
            await this.requestCancellationRefund(order.uuid, input);
        };

        EventBus.emit("ORDER_CANCELLED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            fromStatus: order.status,
            refundRequested: refundRequired,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
      
        logWithContext("info", "[Order] Order cancelled", {
            orderUuid: order.uuid,
            fromStatus: order.status,
            refundRequested: refundRequired,
            reason: input.reason,
        });
      
        return { ...order, refundRequested: refundRequired };
    }

    // The cancellation has committed, so a failure here must not be lost:
    // flag the payment for review so it shows up for manual refund.
    private static async requestCancellationRefund(orderUuid: string, input: CancelInput) {
        try {
            const refund = await RefundService.requestRefund({
                orderUuid,
                reason: `ORDER_CANCELLED: ${input.reason}`,
                requestedBy: input.cancelledBy,
            });
            logWithContext("info", "[Order] Refund requested for cancelled paid order", {
                orderUuid,
                refundUuid: refund.uuid,
            });
        } catch (error: any) {
            logWithContext("error", "[Order] Refund request failed for cancelled paid order", {
                orderUuid,
                error: error.message,
            });
            await prisma.payment.updateMany({
                where: { orderUuid },
                data: {
                    flaggedForReview: true,
                    flaggedAt: new Date(),
                    flagReason: `CANCELLED_ORDER_REFUND_FAILED: ${error.message}`,
                },
            }).catch(() => {});
        }
    }

    //Auto-cancel expired orders (payment timeout)
    static async cancelExpiredOrders() {
        const expirationTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes
 
        const expiredOrders = await prisma.order.findMany({
            where: {
                status: { in: ["PENDING"] },
                paymentStatus: "PENDING",
                createdAt: { lt: expirationTime },
            },
            take: 50,
        });
 
        let cancelled = 0;
 
        for (const order of expiredOrders) {
            try {
                await this.cancelBeforePayment({
                    tenantUuid: order.tenantUuid,
                    orderUuid: order.uuid,
                    reason: "Payment timeout - order expired",
                    cancelledBy: "SYSTEM",
                });
        
                cancelled++;
            } catch (error: any) {
                logWithContext("error", "[Order] Failed to auto-cancel expired order", {
                    orderUuid: order.uuid,
                    error: error.message,
                });
            }
        };
    
        logWithContext("info", "[Order] Auto-cancelled expired orders", {
            count: cancelled,
        });
    
        return cancelled;
    }
}