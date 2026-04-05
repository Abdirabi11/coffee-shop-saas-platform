import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { InventoryService } from "../inventory/inventory.service.ts";

export class OrderCancellationService{
    static async cancelBeforePayment(input: {
        tenantUuid: string;
        orderUuid: string;
        reason: string;
        cancelledBy: string; // User UUID or "SYSTEM"
    }){
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
        });
      
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };
      
        // Can only cancel if not paid yet
        if (order.paymentStatus === "PAID") {
            throw new Error("CANNOT_CANCEL_PAID_ORDER");
        };
      
        // Can only cancel if in cancellable status
        const cancellableStatuses = ["PENDING", "PAYMENT_PENDING"];
        if (!cancellableStatuses.includes(order.status)) {
            throw new Error("ORDER_NOT_CANCELLABLE");
        }
      
        await prisma.$transaction(async (tx) => {
            // Update order status
            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancelledBy: input.cancelledBy,
                    cancellationReason: input.reason,
                },
            });
      
            // Release inventory
            await InventoryService.releaseStock({
                orderUuid: order.uuid,
                tx,
            });
      
            // Update inventory flags
            await tx.orderItem.updateMany({
                where: { orderUuid: order.uuid },
                data: {
                    inventoryReleased: true,
                },
            });
      
            // Create status history
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
        });
      
        EventBus.emit("ORDER_CANCELLED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
      
        logWithContext("info", "[Order] Order cancelled", {
            orderUuid: order.uuid,
            reason: input.reason,
        });
      
        return order;
    }

    //Cancel order after payment (requires refund)
    static async cancelAfterPayment(input: {
        tenantUuid: string;
        orderUuid: string;
        reason: string;
        cancelledBy: string;
    }) {
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                payments: true,
            },
        });
    
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };
 
        if (order.paymentStatus !== "PAID") {
            throw new Error("ORDER_NOT_PAID");
        };
 
        // Check if order is in a cancellable state
        const cancellableStatuses = ["PAID", "PREPARING"];
        if (!cancellableStatuses.includes(order.status)) {
            throw new Error("ORDER_CANNOT_BE_CANCELLED_IN_CURRENT_STATUS");
        };
 
        // Update order
        await prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancelledBy: input.cancelledBy,
                cancellationReason: input.reason,
                },
            });
 
            // Release inventory if committed
            if (order.inventoryCommitted) {
                // Return items to stock
                await InventoryService.releaseStock({
                    orderUuid: order.uuid,
                    tx,
                });
            }
 
            // Create status history
            await tx.orderStatusHistory.create({
                data: {
                    tenantUuid: order.tenantUuid,
                    orderUuid: order.uuid,
                    fromStatus: order.status,
                    toStatus: "CANCELLED",
                    changedBy: input.cancelledBy,
                    reason: input.reason,
                },
            });
        });
 
        // Emit event to trigger refund
        EventBus.emit("ORDER_CANCELLED_AFTER_PAYMENT", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            paymentUuid: order.payments[0]?.uuid,
            amount: order.totalAmount,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
    
        logWithContext("info", "[Order] Paid order cancelled - refund required", {
            orderUuid: order.uuid,
            reason: input.reason,
        });
    
        return order;
    }

    //Auto-cancel expired orders (payment timeout)
    static async cancelExpiredOrders() {
        const expirationTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes
 
        const expiredOrders = await prisma.order.findMany({
            where: {
                status: { in: ["PENDING", "PAYMENT_PENDING"] },
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