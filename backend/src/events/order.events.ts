import prisma from "../config/prisma.ts"
import { bumpCacheVersion } from "../infrastructure/cache/cacheVersion.ts";
import { EventBus } from "./eventBus.ts";
import { FinalizeOrderJob } from "../jobs/Order/finalizeOrder.job.ts";
import { OrderNotificationJob } from "../jobs/Order/orderNotifications.job.ts";
import { InventoryOrderService } from "../services/inventory/InventoryOrder.service.ts";

type OrderEvent =
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_READY"
  | "ORDER_CANCELLED"
  | "PAYMENT_FAILED";

EventBus.on("ORDER_CREATED", async ({ orderUuid, tenantUuid, storeUuid, totalAmount }) => {
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
  
// Stock release on CANCELLED lives in inventory.handlers.ts (registered via
// events/registerEvents.ts). Refunds for paid orders go through
// ORDER_CANCELLED_AFTER_PAYMENT (handlers/order/order.handlers.ts).
EventBus.on("ORDER_STATUS_CHANGED", async ({ storeUuid }) => {
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await bumpCacheVersion(`store:${storeUuid}:active-orders`);
});
  
EventBus.on("PAYMENT_CONFIRMED", async({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] PAYMENT_CONFIRMED: ${orderUuid}`);
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await FinalizeOrderJob.run(orderUuid);
});

EventBus.on("PAYMENT_FAILED", async ({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] PAYMENT_FAILED: ${orderUuid}`);
  await InventoryOrderService.releaseForOrder({ orderUuid });
  await OrderNotificationJob.paymentFailed(orderUuid);
});

EventBus.on("ORDER_READY", async ({ orderUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_READY: ${orderUuid}`);
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await OrderNotificationJob.orderReady(orderUuid);
});

EventBus.on("ORDER_COMPLETED", async ({ orderUuid, tenantUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_COMPLETED: ${orderUuid}`);
  // Update metrics cache
  await bumpCacheVersion(`store:${storeUuid}:metrics`);
});

EventBus.on("PAYMENT_REFUNDED", async ({orderUuid, amount, tenantUuid, storeUuid}) =>{
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

EventBus.on("ORDER_CANCELLED", async ({ orderUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_CANCELLED: ${orderUuid}`);
  await bumpCacheVersion(`store:${storeUuid}:dashboard`);
  await bumpCacheVersion(`store:${storeUuid}:active-orders`);
});

// Order Stuck (alert)
EventBus.on("ORDER_STUCK", async ({ orderUuid, storeUuid }) => {
  console.log(`[EVENT] ORDER_STUCK: ${orderUuid}`);
  
  await prisma.adminAlert.create({
    data: {
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
    },
  });
});


type EventHandler = (payload: any) => Promise<void> | void;

