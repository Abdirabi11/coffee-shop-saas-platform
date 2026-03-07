import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class WebhookRetryJob{
    //Retry failed webhook deliveries
    static async run() {
    const startTime = Date.now();

    logWithContext("info", "[WebhookRetry] Starting retry job");

        try {
            // Get failed deliveries ready for retry
            const deliveries = await prisma.webhookDelivery.findMany({
                where: {
                    status: "PENDING",
                    nextRetryAt: { lte: new Date() },
                },
                include: {
                    webhook: true,
                },
                orderBy: { nextRetryAt: "asc" },
                take: 50,
            });

            if (deliveries.length === 0) {
                logWithContext("debug", "[WebhookRetry] No deliveries to retry");
                return { retried: 0, failed: 0 };
            };

            let retried = 0;
            let failed = 0;
            let abandoned = 0;

            for (const delivery of deliveries) {
                try {
                    // Check if max retries exceeded
                    if (delivery.attemptNumber >= delivery.webhook.maxRetries) {
                        await prisma.webhookDelivery.update({
                            where: { uuid: delivery.uuid },
                            data: { status: "FAILED" },
                        });

                        abandoned++;

                        logWithContext("warn", "[WebhookRetry] Max retries exceeded", {
                            deliveryUuid: delivery.uuid,
                            attempts: delivery.attemptNumber,
                        });

                        continue;
                    };

                    // Update attempt number
                    await prisma.webhookDelivery.update({
                        where: { uuid: delivery.uuid },
                        data: {
                            status: "SENDING",
                            attemptNumber: { increment: 1 },
                            retriedAt: new Date(),
                        },
                    });

                    // Retry the delivery
                    const response = await fetch(delivery.requestUrl, {
                        method: "POST",
                        headers: delivery.requestHeaders as any,
                        body: JSON.stringify(delivery.requestBody),
                        signal: AbortSignal.timeout(30000),
                    });

                    const duration = Date.now() - startTime;
                    const responseBody = await response.text().catch(() => null);

                    if (response.ok) {
                        // Success
                        await prisma.webhookDelivery.update({
                        where: { uuid: delivery.uuid },
                        data: {
                            status: "SUCCESS",
                            responseStatus: response.status,
                            responseBody: responseBody?.substring(0, 10000),
                            duration,
                            completedAt: new Date(),
                        },
                        });

                        retried++;

                        logWithContext("info", "[WebhookRetry] Retry successful", {
                            deliveryUuid: delivery.uuid,
                            attempt: delivery.attemptNumber + 1,
                        });

                        MetricsService.increment("webhook.retry.success", 1, {
                            eventType: delivery.eventType,
                        });

                    } else {
                        // Still failing, schedule next retry
                        const nextRetryAt = this.calculateNextRetry(
                            delivery.attemptNumber + 1,
                            delivery.webhook.retryDelay
                        );

                        await prisma.webhookDelivery.update({
                            where: { uuid: delivery.uuid },
                            data: {
                                status: "PENDING",
                                responseStatus: response.status,
                                responseBody: responseBody?.substring(0, 10000),
                                error: `HTTP ${response.status}`,
                                nextRetryAt,
                            },
                        });

                        failed++;

                        MetricsService.increment("webhook.retry.failed", 1, {
                            eventType: delivery.eventType,
                        });
                    };

                } catch (error: any) {
                    // Error during retry
                    const nextRetryAt = this.calculateNextRetry(
                        delivery.attemptNumber + 1,
                        delivery.webhook.retryDelay
                    );

                    await prisma.webhookDelivery.update({
                        where: { uuid: delivery.uuid },
                        data: {
                        status: "PENDING",
                        error: error.message,
                        nextRetryAt,
                        },
                    });

                    failed++;

                    logWithContext("error", "[WebhookRetry] Retry error", {
                        deliveryUuid: delivery.uuid,
                        error: error.message,
                    });
                }
            }

            const duration = Date.now() - startTime;

            logWithContext("info", "[WebhookRetry] Job completed", {
                total: deliveries.length,
                retried,
                failed,
                abandoned,
                durationMs: duration,
            });

            MetricsService.timing("webhook.retry.job.duration", duration);

            return { retried, failed, abandoned };

        } catch (error: any) {
            logWithContext("error", "[WebhookRetry] Job failed", {
                error: error.message,
            });

            MetricsService.increment("webhook.retry.job.error", 1);

            throw error;
        }
    }

    private static calculateNextRetry(attemptNumber: number, baseDelaySeconds: number): Date {
        const delaySeconds = Math.min(
            Math.pow(2, attemptNumber - 1) * baseDelaySeconds,
            3600 // Max 1 hour
        );

        return new Date(Date.now() + delaySeconds * 1000);
    }
}