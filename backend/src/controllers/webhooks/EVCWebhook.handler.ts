import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { OrderStatusService } from "../../services/order/orderStatus.service.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";


export class EVCWebhookHandler {
  
  static async process(event: any) {
    const { transaction_id, status, reference } = event;

        logWithContext("info", "[EVCWebhook] Processing event", {
            transactionId: transaction_id,
            status,
            reference,
        });

        // Extract order UUID from reference
        const orderUuid = reference;

        if (!orderUuid) {
            logWithContext("warn", "[EVCWebhook] No order reference", {
                transactionId: transaction_id,
            });
            return;
        }

        switch (status) {
            case "APPROVED":
            case "SUCCESS":
                await this.handlePaymentSucceeded(event);
                break;

            case "FAILED":
            case "DECLINED":
                await this.handlePaymentFailed(event);
                break;

            case "PENDING":
                await this.handlePaymentPending(event);
                break;

            default:
                logWithContext("debug", "[EVCWebhook] Unhandled status", {
                    status,
                });
        }
    }

    private static async handlePaymentSucceeded(event: any) {
        const { transaction_id, reference, amount } = event;

        // Update payment record
        await PaymentService.updatePayment({
            providerPaymentId: transaction_id,
            status: "COMPLETED",
            metadata: { evcEvent: event },
        });

        // Update order status
        await OrderStatusService.updateStatus({
            orderUuid: reference,
            status: "PAID",
            updatedBy: "SYSTEM",
            reason: "Payment confirmed by EVC Plus",
        });

        // Emit event
        EventBus.emit("PAYMENT_SUCCESS", {
            orderUuid: reference,
            amount,
            provider: "EVC_PLUS",
        });

        logWithContext("info", "[EVCWebhook] Payment succeeded", {
            orderUuid: reference,
            transactionId: transaction_id,
        });
    }

    private static async handlePaymentFailed(event: any) {
        const { transaction_id, reference, error_message } = event;

        // Update payment record
        await PaymentService.updatePayment({
            providerPaymentId: transaction_id,
            status: "FAILED",
            failureReason: error_message,
            metadata: { evcEvent: event },
        });

        // Update order status
        await OrderStatusService.updateStatus({
            orderUuid: reference,
            status: "PAYMENT_FAILED",
            updatedBy: "SYSTEM",
            reason: `Payment failed: ${error_message}`,
        });

        // Emit event
        EventBus.emit("PAYMENT_FAILED", {
            orderUuid: reference,
            reason: error_message,
        });

        logWithContext("warn", "[EVCWebhook] Payment failed", {
            orderUuid: reference,
            reason: error_message,
        });
    }

    private static async handlePaymentPending(event: any) {
        const { transaction_id, reference } = event;

        await PaymentService.updatePayment({
            providerPaymentId: transaction_id,
            status: "PROCESSING",
            metadata: { evcEvent: event },
        });

        logWithContext("info", "[EVCWebhook] Payment pending", {
            orderUuid: reference,
            transactionId: transaction_id,
        });
    }
}
