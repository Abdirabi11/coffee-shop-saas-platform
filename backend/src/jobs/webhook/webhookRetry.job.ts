import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { WebhookDeadLetterQueue } from "../../services/webhooks/webhookDeadLetterQueue.service.ts";

export class WebhookRetryJob{
    static async run(){
        const startTime = Date.now();
        logWithContext("info", "[WebhookRetry] Starting retry job");

        console.log("[WebhookRetry] Starting...");

        try {
            // Get failed webhooks that are retryable
            const failedWebhooks = await prisma.webhookDeadLetter.findMany({
                where: {
                    status: "FAILED",
                    attemptCount: { lt: 5 },
                },
                orderBy: { createdAt: "asc" },
                take: 20,
            });

            if (failedWebhooks.length === 0) {
                logWithContext("info", "[WebhookRetry] No failed webhooks to retry");
                return;
            }
        
            let retried = 0;
            let failed = 0;
            let abandoned = 0;
    
            for (const webhook of failedWebhooks) {
                try {
                    // Calculate exponential backoff
                    const backoffMinutes = Math.pow(2, webhook.attemptCount)
                    const nextRetryTime = new Date(webhook.updatedAt.getTime() + backoffMinutes * 60 * 1000);
                    // Skip if not ready for retry yet
                    if (new Date() < nextRetryTime) {
                        continue;
                    };

                    logWithContext("info", "[WebhookRetry] Retrying webhook", {
                        webhookUuid: webhook.uuid,
                        eventId: webhook.eventId,
                        attemptCount: webhook.attemptCount + 1,
                    });
                    
                    await WebhookDeadLetterQueue.retry(webhook.uuid);
                    retried++;

                    //double
                    MetricsService.increment("webhook.retry.success", 1, {
                        provider: webhook.provider,
                    });
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[WebhookRetry] Retry failed", {
                        webhookUuid: webhook.uuid,
                        error: error.message,
                    });

                    MetricsService.increment("webhook.retry.failed", 1, {
                        provider: webhook.provider,
                    });
                    
                    // If max retries reached, mark as ABANDONED
                    if (webhook.attemptCount >= 4) {
                        await prisma.webhookDeadLetter.update({
                            where: { uuid: webhook.uuid },
                            data: { status: "ABANDONED" },
                        });

                        abandoned++;

                        const tenantUuid = await this.extractTenantUuid(webhook.payload);
            
                        // Create critical alert
                        await prisma.adminAlert.create({
                            data: {
                                tenantUuid: tenantUuid || "SYSTEM",
                                alertType: "WEBHOOK_ABANDONED",
                                category: "SYSTEM",
                                level: "CRITICAL",
                                priority: "HIGH",
                                title: "Webhook Failed After Max Retries",
                                message: `Webhook ${webhook.eventId} abandoned after 5 attempts - REQUIRES MANUAL INTERVENTION`,
                                context: {
                                    webhookUuid: webhook.uuid,
                                    provider: webhook.provider,
                                    eventType: webhook.eventType,
                                    eventId: webhook.eventId,
                                    error: webhook.errorMessage,
                                    attemptCount: webhook.attemptCount,
                                    payload: webhook.payload,
                                },
                            },
                        });

                        logWithContext("error", "[WebhookRetry] Webhook ABANDONED - manual intervention required", {
                            webhookUuid: webhook.uuid,
                            eventId: webhook.eventId,
                        });
                    }
                }
            }

            const duration = Date.now() - startTime;

            logWithContext("info", "[WebhookRetry] Job completed", {
                total: failedWebhooks.length,
                retried,
                failed,
                abandoned,
                durationMs: duration,
            });

            MetricsService.timing("webhook.retry.job.duration", duration);
            MetricsService.gauge("webhook.retry.queue_size", failedWebhooks.length);

        } catch (error: any) {
            logWithContext("error", "[WebhookRetry] Job failed", {
                error: error.message,
                stack: error.stack,
            });
        
            MetricsService.increment("webhook.retry.job.error", 1);
            throw error;
        };
    }

    //Extract tenant UUID from webhook payload
    private static async extractTenantUuid(payload: any): Promise<string | null> {
        try {
            const orderUuid = payload.data?.object?.metadata?.orderUuid;
            if (!orderUuid) return null;
      
            const order = await prisma.order.findUnique({
                where: { uuid: orderUuid },
                select: { tenantUuid: true },
            });
      
            return order?.tenantUuid || null;  
        } catch (error: any) {
            return null;
        }
    }
};