import { EmailService } from "../services/email.service.ts";
import { FraudSignalService } from "../services/fraud.service.ts";
import { MetricsService } from "../services/metrics.service.ts";
import { OrderStatusService } from "../services/order/order-status.service.ts";
import { InventoryService } from "../services/products/inventory.service.ts";
import { AuditLogService } from "../services/superAdmin/auditLog.service.ts";
import { EventBus } from "./eventBus.ts";

//PAYMENT REFUNDS
EventBus.on("PAYMENT_CONFIRMED", async (payload) => {
  const { orderUuid, storeUuid, amount }= payload;

  await InventoryService.deductForOrder(orderUuid);
  MetricsService.increment("revenue.total", amount, { storeUuid });
  EmailService.sendPaymentReceipt(orderUuid);
});

EventBus.on("PAYMENT_FAILED", async (payload) => {
  const { orderUuid, reason }= payload;

  await OrderStatusService.transition(orderUuid, "PAYMENT_FAILED");
  await EmailService.sendPaymentFailed(orderUuid);
  FraudSignalService.signal("PAYMENT_FAILED", {
    orderUuid,
    reason,
  });
});

EventBus.on("PAYMENT_TIMEOUT", async (payload) => {
  const { orderUuid, storeUuid }= payload;

  MetricsService.increment("checkout.timeout", 1, { storeUuid });
  FraudSignalService.signal("PAYMENT_TIMEOUT", {
    orderUuid,
  });
});

EventBus.on("PAYMENT_RECONCILED", async (payload) => {
  const { paymentUuid, orderUuid, storeUuid }= payload;

  await AuditLogService.record({
    storeUuid,
    action: "PAYMENT_RECONCILED",
    entityUuid: paymentUuid,
    metadata: { orderUuid },
  });
});

FraudSignalService.signalPayment("PAYMENT_FAILED", {
  userUuid,
  orderUuid,
  paymentUuid,
  ipAddress,
});

FraudSignalService.signalPayment("REFUND_COMPLETED", {
  orderUuid,
  amount,
});

FraudSignalService.signalPayment("PAYMENT_TIMEOUT", {
  orderUuid,
});

//REFUND EVENTS

