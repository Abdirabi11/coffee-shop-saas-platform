import prisma from "../../config/prisma.ts"
import { WebhookDeadLetterQueue } from "../../services/webhooks/webhookDeadLetterQueue.service.ts";

export class WebhookRetryJob{
    static async run(){
        console.log("[WebhookRetry] Starting...");

        // Get failed webhooks that are retryable
        const failedWebhooks = await prisma.webhookDeadLetter.findMany({
            where: {
                status: "FAILED",
                attemptCount: { lt: 5 }, // Max 5 retries
            },
            orderBy: { createdAt: "asc" },
            take: 20,
        });
    
        let retried = 0;
        let failed = 0;

        for (const webhook of failedWebhooks) {
            try {
                await WebhookDeadLetterQueue.retry(webhook.uuid);
                retried++;
            } catch (error: any) {
                failed++;
                
                // If max retries reached, mark as ABANDONED
                if (webhook.attemptCount >= 4) {
                    await prisma.webhookDeadLetter.update({
                        where: { uuid: webhook.uuid },
                        data: { status: "ABANDONED" },
                    });
        
                    // Create critical alert
                    await prisma.adminAlert.create({
                        data: {
                            tenantUuid: "SYSTEM",
                            alertType: "WEBHOOK_ABANDONED",
                            category: "SYSTEM",
                            level: "CRITICAL",
                            priority: "HIGH",
                            title: "Webhook Failed After Max Retries",
                            message: `Webhook ${webhook.eventId} abandoned after 5 attempts`,
                            context: {
                                webhookUuid: webhook.uuid,
                                provider: webhook.provider,
                                eventType: webhook.eventType,
                                error: webhook.errorMessage,
                            },
                        },
                    });
                }
            }
        }
        console.log(`[WebhookRetry] Completed: ${retried} retried, ${failed} failed`);
    }
};