import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { WebhookDispatcherService } from "../../services/webhooks/WebhookDispatcher.service.ts";


export function registerWebhookHandlers() {
  
    // Order events
    EventBus.on("ORDER_CREATED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "order.created",
            eventUuid: data.orderUuid,
            payload: {
                order: data.order,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("ORDER_PAID", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "order.paid",
            eventUuid: data.orderUuid,
            payload: {
                order: data.order,
                payment: data.payment,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("ORDER_COMPLETED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "order.completed",
            eventUuid: data.orderUuid,
            payload: {
                order: data.order,
                completedAt: data.completedAt,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("ORDER_CANCELLED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "order.cancelled",
            eventUuid: data.orderUuid,
            payload: {
                order: data.order,
                reason: data.reason,
                timestamp: new Date().toISOString(),
            },
        });
    });

    // Payment events
    EventBus.on("PAYMENT_SUCCESS", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "payment.succeeded",
            eventUuid: data.paymentUuid || data.orderUuid,
            payload: {
                payment: data.payment,
                amount: data.amount,
                provider: data.provider,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("PAYMENT_FAILED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "payment.failed",
            eventUuid: data.paymentUuid || data.orderUuid,
            payload: {
                payment: data.payment,
                reason: data.reason,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("PAYMENT_REFUNDED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            storeUuid: data.storeUuid,
            eventType: "payment.refunded",
            eventUuid: data.refundUuid,
            payload: {
                refund: data.refund,
                amount: data.amount,
                timestamp: new Date().toISOString(),
            },
        });
    });

    // Subscription events
    EventBus.on("SUBSCRIPTION_CREATED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            eventType: "subscription.created",
            eventUuid: data.subscriptionUuid,
            payload: {
                subscription: data.subscription,
                timestamp: new Date().toISOString(),
            },
        });
    });

    EventBus.on("SUBSCRIPTION_CANCELLED", async (data) => {
        await WebhookDispatcherService.dispatch({
            tenantUuid: data.tenantUuid,
            eventType: "subscription.cancelled",
            eventUuid: data.subscriptionUuid,
            payload: {
                subscription: data.subscription,
                reason: data.reason,
                timestamp: new Date().toISOString(),
            },
        });
    });

    logWithContext("info", "[Events] Webhook handlers registered");
}