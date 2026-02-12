import prisma from "../../config/prisma.ts"

interface FailedWebhook {
    provider: string;
    eventUuid: string;
    eventType: string;
    payload: any;
    error: string;
    attemptCount: number;
};

export class WebhookDeadLetterQueue{
    static async add(input: FailedWebhook){
        await prisma.webhookDeadLetter.create({
            data: {
                provider: input.provider,
                eventUuid: input.eventUuid,
                eventType: input.eventType,
                payload: input.payload,
                errorMessage: input.error,
                attemptCount: input.attemptCount,
                status: "FAILED",
            },
        });

        console.log(`[WebhookDLQ] Added failed webhook: ${input.eventId}`);
    }

    /**
   * Retry webhook from DLQ
   */
    static async retry(dlqUuid: string) {
        const dlq = await prisma.webhookDeadLetter.findUnique({
            where: { uuid: dlqUuid },
        });

        if (!dlq) {
            throw new Error("DLQ record not found");
        }

        if (dlq.status === "RESOLVED") {
            throw new Error("Webhook already resolved");
        }

        try {
            // Re-process the webhook
            const PaymentWebhookController = require("@/controllers/payment/webhook/PaymentWebhook.controller");
            
            // Mock request object
            const mockReq = {
                body: dlq.payload,
                headers: {},
                rawBody: Buffer.from(JSON.stringify(dlq.payload)),
            };

            const mockRes = {
                status: (code: number) => ({
                    json: (data: any) => ({ code, data }),
                }),
            };

            await PaymentWebhookController.PaymentWebhookController.handleStripe(mockReq as any, mockRes as any);

            // Mark as resolved
            await prisma.webhookDeadLetter.update({
                where: { uuid: dlqUuid },
                data: {
                    status: "RESOLVED",
                    resolvedAt: new Date(),
                    attemptCount: { increment: 1 },
                },
            });

            console.log(`[WebhookDLQ] Successfully retried: ${dlq.eventUuid}`);
        
        } catch (error: any) {
            // Update attempt count
            await prisma.webhookDeadLetter.update({
                where: { uuid: dlqUuid },
                data: {
                    attemptCount: { increment: 1 },
                    errorMessage: error.message,
                },
            });

            throw error;
        };
    }

    /**
     * Get failed webhooks
    */
    static async getAll(filters?: {
        provider?: string;
        status?: string;
        limit?: number;
    }) {
        return prisma.webhookDeadLetter.findMany({
            where: {
                ...(filters?.provider && { provider: filters.provider }),
                ...(filters?.status && { status: filters.status as any }),
            },
            orderBy: { createdAt: "desc" },
            take: filters?.limit || 100,
        });
    }
}