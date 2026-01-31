import prisma from "../../config/prisma.ts"
import { logWithContext } from "../observability/logger.js";
import { MetricsService } from "../observability/metrics.js";

export class WebhookIdempotencyService{
    static async isWebhookProcessed(
        provider: string,
        eventUuid: string
    ){
        const existing= await prisma.webhookEvent.findUnique({
            where: {
                provider_eventUuid: {provider, eventUuid}
            }
        });

        // return !!existing;

        if (alreadyProcessed) {
            MetricsService.increment(
              "payment.webhook.duplicate",
              1,
              { provider }
            );
          
            logWithContext("warn", "Duplicate webhook ignored", {
              traceUuid,
              webhookEventUuid,
              provider,
            });
        }
          
            return true;
    }

    static async markProcessed(
        provider: string,
        eventId: string
      ) {
        await prisma.webhookEvent.create({
          data: { provider, eventId },
        });
    }
}