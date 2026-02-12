import prisma from "../../config/prisma.ts"
import { logWithContext } from "../observability/logger.ts";
import { MetricsService } from "../observability/metrics.ts";

export class WebhookIdempotencyService{
  static async isWebhookProcessed( provider: string, eventUuid: string ){
    const existing= await prisma.webhookEvent.findUnique({
      where: {
        provider_eventUuid: {provider, eventUuid}
      }
    });

    const alreadyProcessed = !!existing;

    if (alreadyProcessed) {
      MetricsService.increment( "payment.webhook.duplicate", 1, { provider } );

      logWithContext("warn", "Duplicate webhook ignored", {
        provider,
        eventUuid,
      });
    };
        
    return alreadyProcessed;
  }

  static async markProcessed( provider: string, eventUuid: string){
    try {
      await prisma.webhookEvent.upsert({
        where: {
          provider_eventUuid: {
            provider,
            eventUuid,
          },
        },
        update: {
          processedAt: new Date(),
        },
        create: {
          provider,
          eventUuid,
          processedAt: new Date(),
        },
      });
    } catch (error: any) {
      logWithContext("error", "Failed to mark webhook as processed", {
        provider,
        eventUuid,
        error: error.message,
      });
    }
  }
};

