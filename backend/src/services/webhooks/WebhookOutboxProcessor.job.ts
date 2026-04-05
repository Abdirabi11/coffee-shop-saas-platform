import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { WebhookDispatcherService } from "./WebhookDispatcher.service.ts";

export class WebhookOutboxProcessorJob {
  
  //Process pending webhooks in outbox
  static async run(batchSize: number = 100) {
    const startTime = Date.now();

    logWithContext("info", "[OutboxProcessor] Starting outbox processing");

    try {
      // Get pending items ready to be sent
      const items = await prisma.webhookOutbox.findMany({
        where: {
          status: "PENDING",
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: batchSize,
      });

      if (items.length === 0) {
        logWithContext("debug", "[OutboxProcessor] No pending items");
        return { processed: 0, failed: 0 };
      };

      let processed = 0;
      let failed = 0;

      for (const item of items) {
        try {
          // Dispatch webhook
          await WebhookDispatcherService.dispatch({
            tenantUuid: item.tenantUuid,
            storeUuid: item.storeUuid || undefined,
            eventType: item.eventType,
            eventUuid: crypto.randomUUID(),
            payload: item.payload,
          });

          // Mark as sent
          await prisma.webhookOutbox.update({
            where: { uuid: item.uuid },
            data: {
              status: "SENT",
              sentAt: new Date(),
            },
          });

          processed++;

          MetricsService.increment("webhook.outbox.processed", 1, {
            eventType: item.eventType,
          });
          } catch (error: any) {
          failed++;

          const attempts = item.attempts + 1;
          const maxAttempts = 10;

          if (attempts >= maxAttempts) {
            // Mark as permanently failed
            await prisma.webhookOutbox.update({
              where: { uuid: item.uuid },
              data: {
                status: "ABANDONED",
                attempts,
                lastError: error.message,
              },
            });

            logWithContext("error", "[OutboxProcessor] Item abandoned after max retries", {
              outboxUuid: item.uuid,
              eventType: item.eventType,
              attempts,
            });

            MetricsService.increment("webhook.outbox.abandoned", 1, {
              eventType: item.eventType,
            });

            // Create alert
            await prisma.adminAlert.create({
              data: {
                tenantUuid: item.tenantUuid || "SYSTEM",
                type: "WEBHOOK_OUTBOX_FAILED",
                level: "ERROR",
                priority: "MEDIUM",
                title: "Webhook Outbox Failed",
                message: `Failed to process webhook after ${maxAttempts} attempts`,
                metadata: {
                  outboxUuid: item.uuid,
                  eventType: item.eventType,
                  error: error.message,
                },
                status: "PENDING",
              },
            });

          } else {
            // Calculate exponential backoff
            const delaySeconds = Math.min(
              Math.pow(2, attempts) * 60, // 1min, 2min, 4min, 8min...
              3600 // Max 1 hour
            );

            const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

            await prisma.webhookOutbox.update({
              where: { uuid: item.uuid },
              data: {
                attempts,
                lastError: error.message,
                nextRetryAt,
              },
            });

            logWithContext("warn", "[OutboxProcessor] Item retry scheduled", {
              outboxUuid: item.uuid,
              attempt: attempts,
              nextRetryAt,
            });
          }

          MetricsService.increment("webhook.outbox.failed", 1, {
            eventType: item.eventType,
          });
        }
      }

      const duration = Date.now() - startTime;

      logWithContext("info", "[OutboxProcessor] Processing completed", {
        total: items.length,
        processed,
        failed,
        durationMs: duration,
      });

      MetricsService.timing("webhook.outbox.job.duration", duration);

      return { processed, failed };
    } catch (error: any) {
      logWithContext("error", "[OutboxProcessor] Job failed", {
        error: error.message,
      });

      MetricsService.increment("webhook.outbox.job.error", 1);

      throw error;
    }
  }
}