import { AlertService } from "../services/alert.service.ts";
import { EmailService } from "../services/email.service.ts";
import { FraudSignalService } from "../services/fraud.service.ts";
import { MetricsService } from "../services/metrics.service.ts";
import { MonitoringService } from "../services/monitoring.service.ts";
import { RefundService } from "../services/payment/refund.service.ts";
import { WebhookDispatcher } from "../services/webhook.service.ts";
import { EventBus } from "./eventBus.ts";



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
  
    FraudSignalService.signal("REFUND_REQUESTED", { 
        orderUuid,
        amount,
        reason,
        requestedBy,
    });
  
    WebhookDispatcher.dispatch(storeUuid, "REFUND_REQUESTED", 
        storeUuid,
        "REFUND_REQUESTED",
        payload
    );
});
  
EventBus.on("REFUND_PROCESSING", async (payload) => {
    const { refundUuid, orderUuid, storeUuid }= payload;

    MetricsService.increment("refund.processing", 1, {storeUuid});
  
    await MonitoringService.track("refund.process", 
      refundUuid, 
      async () => {
        await RefundService.process(refundUuid);
      });
  
    await WebhookDispatcher.dispatchByOrder(
        orderUuid, 
        "REFUND_PROCESSING",
        payload
    );
});
  
EventBus.on("REFUND_COMPLETED", async (payload) => {
    const { refundUuid, orderUuid, storeUuid, amount } = payload;
  
    await EmailService.sendRefundCompleted(orderUuid, amount);
  
    MetricsService.increment("refund.completed", amount, { storeUuid });
  
    FraudSignalService.signal("REFUND_COMPLETED", {
      orderUuid,
      amount,
    });
  
    await WebhookDispatcher.dispatch(
        storeUuid, 
        "REFUND_COMPLETED",
        payload
    );
});
  
EventBus.on("REFUND_FAILED", async (payload) => {
    const { refundUuid, orderUuid, storeUuid, reason } = payload;
  
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
  
    await WebhookDispatcher.dispatchByOrder(
        orderUuid, 
        "REFUND_FAILED", 
        payload
    );
});
  