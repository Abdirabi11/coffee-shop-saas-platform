import prisma from "../config/prisma.ts"

export class WebhookOutboxService {
    static async enqueue(
      storeUuid: string,
      eventType: string,
      payload: any
    ) {
      await prisma.webhookOutbox.create({
        data: {
          storeUuid,
          eventType,
          payload,
        },
      });
    }
};