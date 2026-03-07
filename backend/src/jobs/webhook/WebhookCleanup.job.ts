import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class WebhookCleanupJob {
  //Clean up old webhook records
    static async run() {
        const startTime = Date.now();

        logWithContext("info", "[WebhookCleanup] Starting cleanup job");

        try {
            // Delete old successful deliveries (older than 30 days)
            const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();

            const deletedDeliveries = await prisma.webhookDelivery.deleteMany({
                where: {
                status: "SUCCESS",
                completedAt: { lt: thirtyDaysAgo },
                },
            });

            // Delete old failed deliveries (older than 90 days)
            const ninetyDaysAgo = dayjs().subtract(90, "day").toDate();

            const deletedFailed = await prisma.webhookDelivery.deleteMany({
                where: {
                    status: "FAILED",
                    completedAt: { lt: ninetyDaysAgo },
                },
            });

            // Delete old outbox items (older than 7 days)
            const sevenDaysAgo = dayjs().subtract(7, "day").toDate();

            const deletedOutbox = await prisma.webhookOutbox.deleteMany({
                where: {
                    status: { in: ["SENT", "ABANDONED"] },
                    createdAt: { lt: sevenDaysAgo },
                },
            });

            // Delete old webhook events (older than 90 days)
            const deletedEvents = await prisma.webhookEvent.deleteMany({
                where: {
                    processedAt: { not: null },
                    createdAt: { lt: ninetyDaysAgo },
                },
            });

            // Delete resolved DLQ items (older than 30 days)
            const deletedDLQ = await prisma.webhookDeadLetter.deleteMany({
                where: {
                    status: "RESOLVED",
                    resolvedAt: { lt: thirtyDaysAgo },
                },
            });

            const duration = Date.now() - startTime;

            logWithContext("info", "[WebhookCleanup] Cleanup completed", {
                deliveries: deletedDeliveries.count,
                failedDeliveries: deletedFailed.count,
                outbox: deletedOutbox.count,
                events: deletedEvents.count,
                dlq: deletedDLQ.count,
                durationMs: duration,
            });

            MetricsService.timing("webhook.cleanup.job.duration", duration);
            MetricsService.gauge("webhook.cleanup.deliveries_deleted", deletedDeliveries.count);

            return {
                deliveries: deletedDeliveries.count,
                failedDeliveries: deletedFailed.count,
                outbox: deletedOutbox.count,
                events: deletedEvents.count,
                dlq: deletedDLQ.count,
            };

        } catch (error: any) {
            logWithContext("error", "[WebhookCleanup] Job failed", {
                error: error.message,
            });

            MetricsService.increment("webhook.cleanup.job.error", 1);

            throw error;
        }
    }
}