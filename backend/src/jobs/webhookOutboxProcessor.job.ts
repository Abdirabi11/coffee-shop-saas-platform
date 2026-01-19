import prisma from "../config/prisma.ts"
import { AlertService } from "../services/alert.service.ts";
import { JobHeartbeatService } from "../services/jobHeartbeat.service.ts";
import { dispatchWebhook } from "../services/webhook.service.ts";

export class WebhookOutboxProcessorJob {
    static async run(batchSize = 50) {
      const items = await prisma.webhookOutbox.findMany({
        where: {
          status: "PENDING",
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } },
          ],
        },
        take: batchSize,
        orderBy: { createdAt: "asc" },
      });
  
      for (const item of items) {
        try {
          await dispatchWebhook(
            item.storeUuid,
            item.eventType,
            item.payload
          );
  
          await prisma.webhookOutbox.update({
            where: { uuid: item.uuid },
            data: { status: "SENT" },
          });
        } catch (err: any) {
          const attempts = item.attempts + 1;
          const nextRetry = new Date(
            Date.now() + Math.min(attempts ** 2 * 1000, 10 * 60 * 1000)
          );
  
          await prisma.webhookOutbox.update({
            where: { uuid: item.uuid },
            data: {
              attempts,
              lastError: err.message,
              nextRetryAt: nextRetry,
              status: attempts >= 10 ? "FAILED" : "PENDING",
            },
          });

          await JobHeartbeatService.beat("WebhookOutboxProcessorJob");
  
          if (attempts >= 10) {
            AlertService.ops(
              "Webhook delivery permanently failed",
              {
                webhookOutboxUuid: item.uuid,
                eventType: item.eventType,
              },
              { storeUuid: item.storeUuid, level: "CRITICAL" }
            );
          }
        }
      }
    }
};