import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { WebhookIdempotencyService } from "../../infrastructure/webhooks/webhookIdempotency.service.ts";
import { WebhookVerifier } from "../../infrastructure/webhooks/webhookVerifier.ts";
import { WebhookDeadLetterQueue } from "./WebhookDeadLetterQueue.service.ts";

export class WebhookReceiverService {
  
    static async process(input: {
        provider: string;
        signature: string;
        rawBody: Buffer;
        handler: (event: any) => Promise<void>;
    }) {
        const startTime = Date.now();

        try {
            // Step 1: Verify signature
            const event = await WebhookVerifier.verify({
                provider: input.provider,
                signature: input.signature,
                rawBody: input.rawBody,
            });

            const eventUuid = this.extractEventId(input.provider, event);
            const eventType = this.extractEventType(input.provider, event);

            // Step 2: Check idempotency
            const alreadyProcessed = await WebhookIdempotencyService.isWebhookProcessed(
                input.provider,
                eventUuid
            );

            if (alreadyProcessed) {
                logWithContext("info", "[Webhook] Duplicate webhook ignored", {
                    provider: input.provider,
                    eventUuid,
                });
                return { status: "duplicate", eventUuid };
            };

            // Step 3: Process webhook
            try {
                await input.handler(event);

                // Step 4: Mark as processed
                await WebhookIdempotencyService.markProcessed(
                    input.provider,
                    eventUuid
                );

                const duration = Date.now() - startTime;

                logWithContext("info", "[Webhook] Processed successfully", {
                    provider: input.provider,
                    eventUuid,
                    eventType,
                    durationMs: duration,
                });

                MetricsService.increment("webhook.received.success", 1, {
                    provider: input.provider,
                    eventType,
                });

                MetricsService.histogram("webhook.processing.duration", duration, {
                    provider: input.provider,
                });

                return { status: "success", eventUuid };

            } catch (handlerError: any) {
                // Step 5: Add to DLQ on failure
                await WebhookDeadLetterQueue.add({
                    provider: input.provider,
                    eventUuid,
                    eventType,
                    payload: event,
                    error: handlerError.message,
                    attemptCount: 1,
                });

                logWithContext("error", "[Webhook] Processing failed, added to DLQ", {
                    provider: input.provider,
                    eventUuid,
                    error: handlerError.message,
                });

                MetricsService.increment("webhook.received.failed", 1, {
                    provider: input.provider,
                    eventType,
                });

                throw handlerError;
            };

        } catch (error: any) {
            logWithContext("error", "[Webhook] Webhook processing error", {
                provider: input.provider,
                error: error.message,
            });

            MetricsService.increment("webhook.received.error", 1, {
                provider: input.provider,
            });

            throw error;
        }
    }

    private static extractEventId(provider: string, event: any): string {
        switch (provider.toLowerCase()) {
            case "stripe":
                return event.id;
            case "evc_plus":
                return event.transaction_id || event.reference;
            default:
                return event.id || event.event_id || crypto.randomUUID();
        }
    }


    private static extractEventType(provider: string, event: any): string {
        switch (provider.toLowerCase()) {
            case "stripe":
                return event.type;
            case "evc_plus":
                return event.event_type || event.type;
            default:
                return event.type || "unknown";
        }
    }
}