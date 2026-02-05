import prisma from "../config/prisma.ts"
import { bumpCacheVersion } from "../cache/cacheVersion.ts";
import { FinalizeOrderJob } from "../jobs/OrderJobs/finalize_order.job.ts";
import { InventoryReleaseJob } from "../jobs/OrderJobs/inventory-release.job.ts";
import { OrderNotificationJob } from "../jobs/OrderJobs/order-notifications.job.ts";
import { RefundOnCancelJob } from "../jobs/OrderJobs/refundOn_cancel.job.ts";
import { NotificationService } from "../services/notification.service.ts";

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

OrderEventBus.on("ORDER_CREATED", async ({ orderUuid, tenantUuid, storeUuid, totalAmount }) => {
  console.log(`[EVENT] ORDER_CREATED: ${orderUuid}`);

  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await bumpCacheVersion(`store:${storeUuid}:active-orders`);

  //Creating email notification (queued for later sending)
  const order = await prisma.order.findUnique({
    where: { uuid: orderUuid },
    include: { tenantUser: { include: { user: true } } },
  });

  if (order?.tenantUser?.user?.email) {
    await prisma.emailOutbox.create({
      data: {
        tenantUuid,
        storeUuid,
        to: [order.tenantUser.user.email],
        subject: "Order Confirmation",
        templateKey: "order_confirmation",
        templateData: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          currency: order.currency,
        },
        priority: "NORMAL",
      }
    })
  }
});
  
OrderEventBus.on("ORDER_STATUS_CHANGED", async ({ orderUuid, tenantUuid, storeUuid, from, to }) => {
  console.log(`[EVENT] ORDER_STATUS_CHANGED: ${orderUuid} (${from} → ${to})`);

  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await bumpCacheVersion(`store:${storeUuid}:active-orders`);

  if (to === "CANCELLED") {
    await InventoryReleaseJob.run(orderUuid);
    // checking if refund needed
    if (from === "PAID" || from === "PREPARING") {
      RefundOnCancelJob.run(orderUuid);
    }
    
    // Alert admin
    await NotificationService.alertAdmin(storeUuid, {
      type: "ORDER_CANCELLED",
      orderUuid,
    });
  };

  if (to === "READY") {
    // Notifiying customer
    OrderNotificationJob.orderReady(orderUuid);
  }
});
  
OrderEventBus.on("PAYMENT_CONFIRMED", async({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] PAYMENT_CONFIRMED: ${orderUuid}`);
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await FinalizeOrderJob.run(orderUuid);
});

OrderEventBus.on("PAYMENT_FAILED", async ({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] PAYMENT_FAILED: ${orderUuid}`);
  await InventoryReleaseJob.run(orderUuid);
  await OrderNotificationJob.paymentFailed(orderUuid);
});

OrderEventBus.on("ORDER_READY", async ({ orderUuid, storeUuid, customerPhone }) => {
  console.log(`[EVENT] ORDER_READY: ${orderUuid}`);
  // Sending notification
  await OrderNotificationJob.orderReady(orderUuid);
});

OrderEventBus.on("ORDER_COMPLETED", async ({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_COMPLETED: ${orderUuid}`);
  // Update metrics cache
  await bumpCacheVersion(`store:${storeUuid}:metrics`);
});

OrderEventBus.on("PAYMENT_REFUNDED", async ({orderUuid, amount, tenantUuid, storeUuid}) =>{
  console.log(`[EVENT] PAYMENT_REFUNDED: ${orderUuid} - $${amount / 100}`);
  const order = await prisma.order.findUnique({
    where: { uuid: orderUuid },
    include: { tenantUser: { include: { user: true } } },
  });

  if (order?.tenantUser?.user?.email) {
    await prisma.emailOutbox.create({
      data: {
        tenantUuid,
        storeUuid,
        to: [order.tenantUser.user.email],
        subject: "Refund Processed",
        templateKey: "refund_completed",
        templateData: {
          orderNumber: order.orderNumber,
          refundAmount: amount,
          currency: order.currency,
        },
        priority: "HIGH",
      },
    });
  };
})

OrderEventBus.on("ORDER_CANCELLED", async ({ orderUuid }) => {
  console.log(`[EVENT] PAYMENT_CONFIRMED: ${orderUuid}`);
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await FinalizeOrderJob.run(orderUuid);
});

// Order Stuck (alert)
OrderEventBus.on("ORDER_STUCK", async ({ orderUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_STUCK: ${orderUuid}`);
  
  await AdminAlert.create({
    tenantUuid: (await prisma.store.findUnique({ where: { uuid: storeUuid } }))?.tenantUuid!,
    storeUuid,
    alertType: "ORDER_ISSUE",
    category: "OPERATIONAL",
    level: "WARNING",
    title: "Order Stuck in Processing",
    message: `Order ${orderUuid} has been stuck in PAID status for too long`,
    affectedEntity: "order",
    affectedEntityId: orderUuid,
    priority: "HIGH",
  });
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
