import { bumpCacheVersion } from "../cache/cacheVersion.ts";
import { FinalizeOrderJob } from "../jobs/OrderJobs/finalize_order.job.ts";
import { InventoryReleaseJob } from "../jobs/OrderJobs/inventory-release.job.ts";
import { OrderNotificationJob } from "../jobs/OrderJobs/order-notifications.job.ts";
import { RefundOnCancelJob } from "../jobs/OrderJobs/refundOn_cancel.job.ts";
import { NotificationService } from "../services/notification.service.ts";
import { EventBus } from "./eventBus.ts";

type OrderEvent =
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_READY"
  | "ORDER_CANCELLED"
  | "PAYMENT_FAILED";

type OrderEvent =
  | "ORDER_CREATED"
  | "ORDER_PAID"
  | "ORDER_CANCELLED"
  | "ORDER_COMPLETED";

EventBus.on("ORDER_CREATED", ({ storeUuid }) => {
    bumpCacheVersion(`store:${storeUuid}:dashboard`);
    bumpCacheVersion(`store:${storeUuid}:active-orders`);

    //     When do we create EmailOutbox records?
    // Inside events, NOT controllers.
    // This happens inside the same DB transaction as the business event
    // ✔️ No email is sent yet
    await prisma.emailOutbox.create({
      data: {
        storeUuid,
        to: customerEmail,
        subject: "Refund completed",
        template: "refund_completed",
        payload: {
          orderUuid,
          refundAmount,
        },
      },
    });
});
  
EventBus.on("ORDER_STATUS_CHANGED", ({ storeUuid }) => {
    bumpCacheVersion(`store:${storeUuid}:dashboard`);
    bumpCacheVersion(`store:${storeUuid}:active-orders`);
});
  
EventBus.on("PAYMENT_CONFIRMED", ({ storeUuid }) => {
    bumpCacheVersion(`store:${storeUuid}:dashboard`);
});

EventBus.on("ORDER_CANCELLED", async ({ orderUuid }) => {
  await InventoryReleaseJob.run(orderUuid);
});

EventBus.on("PAYMENT_FAILED", async ({ orderUuid }) => {
  await InventoryReleaseJob.run(orderUuid);
});

type EventHandler = (payload: any) => Promise<void> | void;

export class OrderEventBus {
    private static handlers: Record<string, EventHandler[]> = {};
  
    static on(event: OrderEvent, handler: EventHandler) {
      if (!this.handlers[event]) {
        this.handlers[event] = [];
      }
      this.handlers[event].push(handler);
    }
  
    static emit(event: OrderEvent, payload: any) {
      console.log(`[EVENT] ${event}`, payload);
  
      this.handlers[event]?.forEach(handler => {
        handler(payload);
      });
    }
};

export class OrderEventEmitter {
    static emit(event: string, payload: any) {
      console.log(`[EVENT] ${event}`, payload);
      // future:
    // - metrics
    // - notifications
    // - webhooks
    // - fraud detection
    }
};

OrderEventBus.on("ORDER_READY", async ({ orderUuid, storeUuid }) => {
    await NotificationService.sendPush(
      "userUuid",
      "Your order is ready ☕"
    );
  });
  
OrderEventBus.on("PAYMENT_FAILED", async ({ orderUuid }) => {
    await NotificationService.sendEmail(
      "user@email.com",
      "Payment failed for your order"
    );
});
  
OrderEventBus.on("ORDER_CANCELLED", async ({ storeUuid }) => {
    await NotificationService.alertAdmin(
      storeUuid,
      "Order was cancelled"
    );
});

OrderEventBus.on("PAYMENT_CONFIRMED", ({ orderUuid }) => {
  FinalizeOrderJob.enqueue(orderUuid);
});

OrderEventBus.on("ORDER_STATUS_CHANGED", ({ orderUuid, from, to }) => {
  if (from === "PAID" && to === "CANCELLED") {
    RefundOnCancelJob.enqueue(orderUuid);
  }
});

OrderEventBus.on("ORDER_CANCELLED", ({ orderUuid }) => {
  InventoryReleaseJob.run(orderUuid);
});

OrderEventBus.on("PAYMENT_CONFIRMED", ({ orderUuid }) => {
  FinalizeOrderJob.run(orderUuid);
});

OrderEventBus.on("ORDER_READY", ({ orderUuid }) =>
  OrderNotificationJob.orderReady(orderUuid)
);

OrderEventBus.on("PAYMENT_FAILED", ({ orderUuid }) =>
  OrderNotificationJob.paymentFailed(orderUuid)
);