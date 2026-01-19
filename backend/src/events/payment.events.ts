import { AlertService } from "../services/alert.service.ts";
import { EmailService } from "../services/email.service.ts";
import { FraudSignalService } from "../services/fraud.service.ts";
import { MetricsService } from "../services/metrics.service.ts";
import { MonitoringService } from "../services/monitoring.service.ts";
import { OrderStatusService } from "../services/order/order-status.service.ts";
import { RefundService } from "../services/payment/refund.service.ts";
import { InventoryService } from "../services/products/inventory.service.ts";
import { AuditLogService } from "../services/superAdmin/auditLog.service.ts";
import { WebhookDispatcher } from "../services/webhook.service.ts";
import { EventBus } from "./eventBus.ts";


EventBus.on("PAYMENT_CONFIRMED", async ({ orderUuid, storeUuid, amount }) => {
    await InventoryService.deductForOrder(orderUuid);
    await OrderStatusService.transition(orderUuid, "PAID");

    MetricsService.increment("revenue.total", amount, { storeUuid });

    EmailService.sendPaymentReceipt(orderUuid);
});

EventBus.on("PAYMENT_FAILED", async ({ orderUuid, reason }) => {
  await OrderStatusService.transition(orderUuid, "PAYMENT_FAILED");

  EmailService.sendPaymentFailed(orderUuid);

  FraudSignalService.signal("PAYMENT_FAILED", {
    orderUuid,
    reason,
  });
});

EventBus.on("PAYMENT_TIMEOUT", async ({ orderUuid, storeUuid }) => {
  MetricsService.increment("checkout.timeout", 1, { storeUuid });

  FraudSignalService.signal("PAYMENT_TIMEOUT", {
    orderUuid,
  });
});

EventBus.on("PAYMENT_RECONCILED", async ({ paymentUuid, orderUuid, storeUuid }) => {
  AuditLogService.record({
    storeUuid,
    action: "PAYMENT_RECONCILED",
    entityUuid: paymentUuid,
    metadata: { orderUuid },
  });
});

EventBus.on("REFUND_REQUESTED", async (payload) => {
  const {
    refundUuid,
    orderUuid,
    storeUuid,
    amount,
    currency,
    reason,
    requestedBy,
  } = payload;

  EmailService.sendRefundRequested(orderUuid, amount, currency);

  MetricsService.increment("refund.requested", amount, { storeUuid });

  FraudSignalService.signal("REFUND_REQUESTED", { orderUuid, amount, reason, });

  WebhookDispatcher.dispatch(storeUuid, "REFUND_REQUESTED", payload);
});

EventBus.on("REFUND_PROCESSING", async ({ refundUuid, orderUuid }) => {
  MetricsService.increment("refund.processing", 1);

  MonitoringService.track("refund.process", refundUuid, async () => {
    await RefundService.process(refundUuid);
  });

  WebhookDispatcher.dispatchByOrder(orderUuid, "REFUND_PROCESSING");
});

EventBus.on("REFUND_COMPLETED", async (payload) => {
  const { refundUuid, orderUuid, storeUuid, amount } = payload;

  EmailService.sendRefundCompleted(orderUuid, amount);

  MetricsService.increment("refund.completed", amount, { storeUuid });

  FraudSignalService.signal("REFUND_COMPLETED", {
    orderUuid,
    amount,
  });

  WebhookDispatcher.dispatch(storeUuid, "REFUND_COMPLETED", payload);
});

EventBus.on("REFUND_FAILED", async (payload, storeUuid: string) => {
  const { refundUuid, orderUuid, reason } = payload;

  AlertService.ops("Refund failed", 
    { refundUuid, orderUuid, reason },
    { storeUuid, level: "ERROR" }
  );

  MetricsService.increment("refund.failed", 1,{
    storeUuid,
    reason,
  });

  FraudSignalService.signal("REFUND_FAILED", {
    orderUuid,
    reason,
  });

  WebhookDispatcher.dispatchByOrder(orderUuid, "REFUND_FAILED", payload);
});
