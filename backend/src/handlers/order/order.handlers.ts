import { logWithContext } from "../../infrastructure/observability/logger.js";
import prisma from "../../config/prisma.js"
import { InventoryService } from "../../services/inventory/inventory.service.js";
import { RefundService } from "../../services/payment/refund.service.js";
import { EventBus } from "../../events/eventBus.js";
import { OrderStatusService } from "../services/order/order-status.service.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.js";
import { OrderCacheService } from "../../services/cache/orderCache.service.js";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.js";


//Order Created → Start payment flow
EventBus.on("ORDER_CREATED", async (payload) => {
    logWithContext("info", "[OrderEvent] ORDER_CREATED", {
        orderUuid: payload.orderUuid,
    });

    try {
        // Invalidate caches
        await OrderCacheService.invalidateStoreCache(payload.storeUuid);
    
        MetricsService.increment("order.created", 1, {
          tenantUuid: payload.tenantUuid,
          storeUuid: payload.storeUuid,
        });
    } catch (error: any) {
        logWithContext("error", "[OrderEvent] Failed to process ORDER_CREATED", {
          error: error.message,
        });
    };
});

//Payment Confirmed → Commit inventory & transition status
EventBus.on("PAYMENT_CONFIRMED", async (payload) => {
    logWithContext("info", "[OrderEvent] PAYMENT_CONFIRMED", {
        orderUuid: payload.orderUuid,
    });

    try {
        // Commit inventory reservation
        await InventoryService.commitReservation({
            orderUuid: payload.orderUuid,
        });

        // Update order payment status
        await prisma.order.update({
            where: { uuid: payload.orderUuid },
            data: {
                paymentStatus: "PAID",
                inventoryCommitted: true,
            },
        });

        // Transition order to PAID status
        await OrderStatusService.transition(payload.orderUuid, "PAID", {
            changedBy: "SYSTEM",
            reason: "Payment confirmed",
        });

        // Invalidate caches
        await OrderCacheService.invalidateOrderDetails(payload.orderUuid);
        await OrderCacheService.invalidateStoreCache(payload.storeUuid);

        MetricsService.increment("payment.confirmed", 1, {
            tenantUuid: payload.tenantUuid,
        });
    } catch (error: any) {
        logWithContext("error", "[OrderEvent] Failed to process payment confirmation", {
            orderUuid: payload.orderUuid,
            error: error.message,
        });

         // Send to DLQ for retry
        await DeadLetterQueue.record(
            payload.tenantUuid,
            "PAYMENT_CONFIRMATION",
            payload,
            error.message
        );
    }
});

//Payment Failed → Release inventory & mark order failed
EventBus.on("PAYMENT_FAILED", async (payload) => {
    logWithContext("info", "[OrderEvent] PAYMENT_FAILED", {
        orderUuid: payload.orderUuid,
    });

    try {
        // Release inventory
        await InventoryService.releaseStock({
            orderUuid: payload.orderUuid,
        });

        // Update order
        await prisma.order.update({
            where: { uuid: payload.orderUuid },
            data: {
                paymentStatus: "FAILED",
                inventoryReleased: true,
            },
        });

        // Transition to PAYMENT_FAILED
        await OrderStatusService.transition(payload.orderUuid, "PAYMENT_FAILED", {
            changedBy: "SYSTEM",
            reason: `Payment failed: ${payload.failureReason}`,
        });

        // Invalidate caches
        await OrderCacheService.invalidateOrderDetails(payload.orderUuid);
        await OrderCacheService.invalidateStoreCache(payload.storeUuid);

        MetricsService.increment("payment.failed", 1, {
            reason: payload.failureReason,
        });
    } catch (error: any) {
        logWithContext("error", "[OrderEvent] Failed to process payment failure", {
            orderUuid: payload.orderUuid,
            error: error.message,
        });
    }
});

/**
* Order Cancelled After Payment → Initiate refund
*/
EventBus.on("ORDER_CANCELLED_AFTER_PAYMENT", async (payload) => {
    logWithContext("info", "[OrderEvent] ORDER_CANCELLED_AFTER_PAYMENT", {
        orderUuid: payload.orderUuid,
    });

    try {
        // Request refund
        await RefundService.requestRefund({
            orderUuid: payload.orderUuid,
            amount: payload.amount,
            reason: payload.reason,
            requestedBy: payload.cancelledBy,
        });

        // Invalidate caches
        await OrderCacheService.invalidateOrderDetails(payload.orderUuid);
        await OrderCacheService.invalidateStoreCache(payload.storeUuid);

        MetricsService.increment("order.refund.requested", 1);
    } catch (error: any) {
        logWithContext("error", "[OrderEvent] Failed to initiate refund", {
            orderUuid: payload.orderUuid,
            error: error.message,
        });
    }
});

//ORDER_STATUS_CHANGED → Invalidate caches
EventBus.on("ORDER_STATUS_CHANGED", async (payload) => {
    logWithContext("info", "[OrderEvent] ORDER_STATUS_CHANGED", {
        orderUuid: payload.orderUuid,
        from: payload.from,
        to: payload.to,
    });
    try {
        // Invalidate caches
        await OrderCacheService.invalidateOrderDetails(payload.orderUuid);
        await OrderCacheService.invalidateStoreCache(payload.storeUuid);

        MetricsService.increment("order.status.changed", 1, {
            from: payload.from,
            to: payload.to,
        });
    } catch (error: any) {
        logWithContext("error", "[OrderEvent] Failed to process status change", {
            error: error.message,
        });
    }
});