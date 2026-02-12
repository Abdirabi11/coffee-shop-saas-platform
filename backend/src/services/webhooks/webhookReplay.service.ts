import prisma from "../../config/prisma.ts"

export class WebhookReplayService {
    static async replayByEventId(provider: string, eventUuid: string) {
        // Find webhook event
        const webhook = await prisma.webhookEvent.findUnique({
            where: {
                provider_eventUuid: {
                    provider,
                    eventUuid,
                },
            },
        });
    
        if (!webhook) {
            throw new Error("Webhook event not found");
        }
    
        // Create replay record
        const replay = await prisma.webhookReplay.create({
            data: {
                webhookEventUuid: webhook.uuid,
                provider: webhook.provider,
                eventUuid: webhook.eventUuid,
                eventType: webhook.eventType,
                payload: webhook.payload,
                status: "PENDING",
            },
        });
        
        try {
            // Mock request and replay
            const PaymentWebhookController = require("@/controllers/payment/webhook/PaymentWebhook.controller");
            
            const mockReq = {
                body: webhook.payload,
                headers: {
                "x-replay-id": replay.uuid,
                },
                rawBody: Buffer.from(JSON.stringify(webhook.payload)),
            };
    
            const mockRes = {
                status: (code: number) => ({
                    json: (data: any) => ({ code, data }),
                    send: () => ({ code }),
                }),
            };
        
            await PaymentWebhookController.PaymentWebhookController.handleStripe(mockReq as any, mockRes as any);
    
            // Mark as success
            await prisma.webhookReplay.update({
                where: { uuid: replay.uuid },
                data: {
                    status: "SUCCESS",
                    completedAt: new Date(),
                },
            });
    
            console.log(`[WebhookReplay] Successfully replayed: ${eventId}`);
            
            return replay;
              
        } catch (error: any) {
            // Mark as failed
            await prisma.webhookReplay.update({
                where: { uuid: replay.uuid },
                data: {
                    status: "FAILED",
                    errorMessage: error.message,
                    completedAt: new Date(),
                },
            });
    
            console.error(`[WebhookReplay] Failed to replay: ${eventId}`, error.message);
            
            throw error;
        }
    }

    /**
     * Replay all webhooks for a time range
    */
    static async replayByTimeRange(input: {
        provider: string;
        startDate: Date;
        endDate: Date;
        eventType?: string;
    }) {
        const webhooks= await prisma.webhookEvent.findMany({
            where: {
                provider: input.provider,
                ...(input.eventType && { eventType: input.eventType }),
                createdAt: {
                    gte: input.startDate,
                    lte: input.endDate,
                },
            },
            orderBy: { createdAt: "asc" },
        });

        console.log(`[WebhookReplay] Replaying ${webhooks.length} webhooks`);

        const results = {
            total: webhooks.length,
            success: 0,
            failed: 0,
        };

        for(const webhook of webhooks) {
            try {
                await this.replayByEventId(webhook.provider, webhook.eventId);
                results.success++;
            } catch (error) {
                results.failed++;
            }
        };

        console.log(`[WebhookReplay] Completed: ${results.success} success, ${results.failed} failed`);
        return results;
    }

    /**
     * Get replay history
    */
    static async getReplayHistory(filters?: {
        provider?: string;
        status?: string;
        limit?: number;
    }) {
        return prisma.webhookRepl.findMany({
            where: {
                ...(filters?.provider && { provider: filters.provider }),
                ...(filters?.status && { status: filters.status as any }),
            },
            include: {
                webhookEvent: true,
            },
            orderBy: { createdAt: "desc" },
            take: filters?.limit || 50,
        })
    }
}