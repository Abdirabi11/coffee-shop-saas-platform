import prisma  from "../../config/prisma.ts"
import crypto from "crypto";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class WebhookDispatcherService {
    //Dispatch webhook to all subscribed endpoints
    static async dispatch(input: {
        tenantUuid: string;
        storeUuid?: string;
        eventType: string;
        eventUuid: string;
        payload: any;
    }) {
        const startTime = Date.now();

        try {
            // Find all active webhooks subscribed to this event
            const webhooks = await prisma.webhook.findMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    ...(input.storeUuid && { storeUuid: input.storeUuid }),
                    isActive: true,
                    events: { has: input.eventType },
                },
            });

            if (webhooks.length === 0) {
                logWithContext("debug", "[Webhook] No webhooks subscribed", {
                eventType: input.eventType,
                });
                return;
            };

            // Create delivery records
            const deliveries = await Promise.all(
                webhooks.map((webhook) =>
                    prisma.webhookDelivery.create({
                        data: {
                            webhookUuid: webhook.uuid,
                            eventType: input.eventType,
                            eventUuid: input.eventUuid,
                            requestUrl: webhook.url,
                            requestHeaders: {
                                "Content-Type": "application/json",
                                "X-Webhook-Signature": this.signPayload(input.payload, webhook.secret),
                                "X-Webhook-Id": webhook.uuid,
                                "X-Event-Type": input.eventType,
                                "X-Event-Id": input.eventUuid,
                                ...webhook.headers as any,
                            },
                            requestBody: input.payload,
                            status: "PENDING",
                        },
                    })
                )
            );

            // Dispatch to each endpoint (async, don't wait)
            deliveries.forEach((delivery) => {
                this.sendWebhook(delivery.uuid).catch((error) => {
                    logWithContext("error", "[Webhook] Dispatch failed", {
                        deliveryUuid: delivery.uuid,
                        error: error.message,
                    });
                });
            });

            const duration = Date.now() - startTime;

            logWithContext("info", "[Webhook] Dispatched to endpoints", {
                eventType: input.eventType,
                webhookCount: webhooks.length,
                durationMs: duration,
            });

            MetricsService.increment("webhook.dispatched", 1, {
                eventType: input.eventType,
            });

            MetricsService.histogram("webhook.dispatch.duration", duration);

        } catch (error: any) {
            logWithContext("error", "[Webhook] Dispatch error", {
                error: error.message,
                eventType: input.eventType,
            });

            MetricsService.increment("webhook.dispatch.error", 1);

            throw error;
        }
    }

    //Send individual webhook
    private static async sendWebhook(deliveryUuid: string) {
        const delivery = await prisma.webhookDelivery.findUnique({
            where: { uuid: deliveryUuid },
            include: { webhook: true },
        });

        if (!delivery) {
            throw new Error("DELIVERY_NOT_FOUND");
        };

        // Update to SENDING
        await prisma.webhookDelivery.update({
            where: { uuid: deliveryUuid },
            data: { status: "SENDING" },
        });

        const startTime = Date.now();

        try {
            const response = await fetch(delivery.requestUrl, {
                method: "POST",
                headers: delivery.requestHeaders as any,
                body: JSON.stringify(delivery.requestBody),
                signal: AbortSignal.timeout(30000), // 30 second timeout
            });

            const duration = Date.now() - startTime;
            const responseBody = await response.text().catch(() => null);

            // Update delivery
            await prisma.webhookDelivery.update({
                where: { uuid: deliveryUuid },
                data: {
                    status: response.ok ? "SUCCESS" : "FAILED",
                    responseStatus: response.status,
                    responseHeaders: Object.fromEntries(response.headers.entries()),
                    responseBody: responseBody?.substring(0, 10000), // Limit size
                    duration,
                    completedAt: new Date(),
                },
            });

            // Update webhook last triggered
            await prisma.webhook.update({
                where: { uuid: delivery.webhookUuid },
                data: { lastTriggered: new Date() },
            });

            if (response.ok) {
                MetricsService.increment("webhook.delivery.success", 1, {
                    eventType: delivery.eventType,
                });
                MetricsService.histogram("webhook.delivery.duration", duration);
            } else {
                MetricsService.increment("webhook.delivery.failed", 1, {
                    eventType: delivery.eventType,
                    status: response.status.toString(),
                });

                // Schedule retry
                await this.scheduleRetry(deliveryUuid);
            };
        } catch (error: any) {
            const duration = Date.now() - startTime;

            const isTimeout = error.name === "AbortError";
            const status = isTimeout ? "TIMEOUT" : "FAILED";

            await prisma.webhookDelivery.update({
                where: { uuid: deliveryUuid },
                data: {
                    status,
                    error: error.message,
                    duration,
                    completedAt: new Date(),
                },
            });

            MetricsService.increment(`webhook.delivery.${status.toLowerCase()}`, 1, {
                eventType: delivery.eventType,
            });

            // Schedule retry
            await this.scheduleRetry(deliveryUuid);

            throw error;
        }
    }

    //Schedule retry
    private static async scheduleRetry(deliveryUuid: string) {
        const delivery = await prisma.webhookDelivery.findUnique({
            where: { uuid: deliveryUuid },
            include: { webhook: true },
        });

        if (!delivery) return;

        const nextAttempt = delivery.attemptNumber + 1;

        if (nextAttempt > delivery.webhook.maxRetries) {
            logWithContext("warn", "[Webhook] Max retries exceeded", {
                deliveryUuid,
                attempts: delivery.attemptNumber,
            });
            return;
        }

        // Exponential backoff: 1min, 2min, 4min, 8min, 16min
        const delaySeconds = Math.min(
            Math.pow(2, delivery.attemptNumber) * delivery.webhook.retryDelay,
            3600 // Max 1 hour
        );

        const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

        await prisma.webhookDelivery.update({
            where: { uuid: deliveryUuid },
            data: {
                status: "PENDING",
                nextRetryAt,
            },
        });

        logWithContext("info", "[Webhook] Retry scheduled", {
            deliveryUuid,
            attempt: nextAttempt,
            nextRetryAt,
        });
    }

    private static signPayload(payload: any, secret: string): string {
        return crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(payload))
            .digest("hex");
    }
}