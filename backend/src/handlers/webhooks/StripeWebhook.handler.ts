import { EventBus } from "../../events/eventBus.js";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { OrderStatusService } from "../../services/order/orderStatus.service.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";



export class StripeWebhookHandler {
  
    static async process(event: any) {
        const { type, data } = event;

        logWithContext("info", "[StripeWebhook] Processing event", {
            eventId: event.id,
            type,
        });

        switch (type) {
            case "payment_intent.succeeded":
                await this.handlePaymentSucceeded(data.object)
                break;

            case "payment_intent.payment_failed":
                await this.handlePaymentFailed(data.object);
                break;

            case "charge.refunded":
                await this.handleChargeRefunded(data.object);
                break;
        
            case "customer.subscription.created":
                await this.handleSubscriptionCreated(data.object);
                break;

            case "customer.subscription.updated":
                await this.handleSubscriptionUpdated(data.object);
                break;

            case "customer.subscription.deleted":
                await this.handleSubscriptionDeleted(data.object);
                break;

            default:
                logWithContext("debug", "[StripeWebhook] Unhandled event type", {
                    type,
                });
        }
    }

    private static async handlePaymentSucceeded(paymentIntent: any) {
        const orderUuid = paymentIntent.metadata?.orderUuid;
        const tenantUuid = paymentIntent.metadata?.tenantUuid;

        if (!orderUuid) {
            logWithContext("warn", "[StripeWebhook] No orderUuid in metadata", {
                paymentIntentId: paymentIntent.id,
            });
            return;
        }

        // Update payment record
        await PaymentService.updatePayment({
            providerPaymentId: paymentIntent.id,
            status: "COMPLETED",
            metadata: {
                paymentIntent,
            },
        });

        // Update order status
        await OrderStatusService.updateStatus({
            orderUuid,
            status: "PAID",
            updatedBy: "SYSTEM",
            reason: "Payment confirmed by Stripe",
        });

        // Emit event
        EventBus.emit("PAYMENT_SUCCESS", {
            orderUuid,
            tenantUuid,
            amount: paymentIntent.amount,
            provider: "STRIPE",
        });

        logWithContext("info", "[StripeWebhook] Payment succeeded", {
            orderUuid,
            amount: paymentIntent.amount,
        });
    }

    private static async handlePaymentFailed(paymentIntent: any) {
        const orderUuid = paymentIntent.metadata?.orderUuid;

        if (!orderUuid) return;

        // Update payment record
        await PaymentService.updatePayment({
            providerPaymentId: paymentIntent.id,
            status: "FAILED",
            failureReason: paymentIntent.last_payment_error?.message,
            metadata: {
                paymentIntent,
            },
        });

        // Update order status
        await OrderService.updateStatus({
            orderUuid,
            status: "PAYMENT_FAILED",
            updatedBy: "SYSTEM",
            reason: `Payment failed: ${paymentIntent.last_payment_error?.message}`,
        });

        // Emit event
        EventBus.emit("PAYMENT_FAILED", {
            orderUuid,
            reason: paymentIntent.last_payment_error?.message,
        });

        logWithContext("warn", "[StripeWebhook] Payment failed", {
            orderUuid,
            reason: paymentIntent.last_payment_error?.message,
        });
    }

    private static async handleChargeRefunded(charge: any) {
        const orderUuid = charge.metadata?.orderUuid;

        if (!orderUuid) return;

        // Create refund record
        await PaymentService.createRefund({
            paymentId: charge.payment_intent,
            amount: charge.amount_refunded,
            reason: "stripe_webhook_refund",
            refundedBy: "SYSTEM",
        });

        EventBus.emit("PAYMENT_REFUNDED", {
            orderUuid,
            amount: charge.amount_refunded,
        });

        logWithContext("info", "[StripeWebhook] Charge refunded", {
            orderUuid,
            amount: charge.amount_refunded,
        });
    }

    private static async handleSubscriptionCreated(subscription: any) {
        const tenantUuid = subscription.metadata?.tenantUuid;

        if (!tenantUuid) return;

        // Subscription logic handled in subscription service
        logWithContext("info", "[StripeWebhook] Subscription created", {
            subscriptionId: subscription.id,
            tenantUuid,
        });
    }

    private static async handleSubscriptionUpdated(subscription: any) {
        logWithContext("info", "[StripeWebhook] Subscription updated", {
            subscriptionId: subscription.id,
            status: subscription.status,
        });
    }

    private static async handleSubscriptionDeleted(subscription: any) {
        const tenantUuid = subscription.metadata?.tenantUuid;

        if (!tenantUuid) return;

        // Handle subscription cancellation
        logWithContext("warn", "[StripeWebhook] Subscription deleted", {
            subscriptionId: subscription.id,
            tenantUuid,
        });
    }
}
