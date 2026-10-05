import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

interface FailedWebhook {
    provider: string;
    eventUuid: string;
    eventType: string;
    payload: any;
    error: string;
    attemptCount: number;
}

export class WebhookDeadLetterQueue {
  
    static async add(input: FailedWebhook) {
        try {
            const dlq = await prisma.webhookDeadLetter.create({
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

            logWithContext("error", "[DLQ] Webhook added to dead letter queue", {
                dlqUuid: dlq.uuid,
                provider: input.provider,
                eventUuid: input.eventUuid,
                eventType: input.eventType,
            });

            MetricsService.increment("webhook.dlq.added", 1, {
                provider: input.provider,
                eventType: input.eventType,
            });

            // Emit event for monitoring
            EventBus.emit("WEBHOOK_FAILED", {
                dlqUuid: dlq.uuid,
                provider: input.provider,
                eventType: input.eventType,
                error: input.error,
            });

            return dlq;

        } catch (error: any) {
            logWithContext("error", "[DLQ] Failed to add to DLQ", {
                error: error.message,
            });
            throw error;
        }
    }

    static async retry(dlqUuid: string) {
        const dlq = await prisma.webhookDeadLetter.findUnique({
            where: { uuid: dlqUuid },
        });

        if (!dlq) {
            throw new Error("DLQ_RECORD_NOT_FOUND");
        };

        if (dlq.status === "RESOLVED") {
            throw new Error("WEBHOOK_ALREADY_RESOLVED");
        };

        // Update to RETRYING
        await prisma.webhookDeadLetter.update({
            where: { uuid: dlqUuid },
            data: {
                status: "RETRYING",
                attemptCount: { increment: 1 },
            },
        });

        try {
            // Get the appropriate handler based on provider
            const handler = this.getHandlerForProvider(dlq.provider);

            // Process the webhook
            await handler(dlq.payload);

            // Mark as resolved
            await prisma.webhookDeadLetter.update({
                where: { uuid: dlqUuid },
                data: {
                    status: "RESOLVED",
                    resolvedAt: new Date(),
                },
            });

            logWithContext("info", "[DLQ] Webhook successfully retried", {
                dlqUuid,
                eventUuid: dlq.eventUuid,
            });

            MetricsService.increment("webhook.dlq.retry.success", 1, {
                provider: dlq.provider,
            });

            return { success: true };

        } catch (error: any) {
            // Mark as failed again
            await prisma.webhookDeadLetter.update({
                where: { uuid: dlqUuid },
                data: {
                    status: "FAILED",
                    errorMessage: error.message,
                },
            });

            logWithContext("error", "[DLQ] Retry failed", {
                dlqUuid,
                error: error.message,
            });

            MetricsService.increment("webhook.dlq.retry.failed", 1, {
                provider: dlq.provider,
            });

            throw error;
        }
    }

    static async retryBulk(input: {
        provider?: string;
        eventType?: string;
        limit?: number;
    }) {
        const where: any = {
            status: "FAILED",
            attemptCount: { lt: 5 },
        };

        if (input.provider) where.provider = input.provider;
        if (input.eventType) where.eventType = input.eventType;

        const dlqs = await prisma.webhookDeadLetter.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: input.limit || 10,
        });

        const results = {
            total: dlqs.length,
            success: 0,
            failed: 0,
        };

        for (const dlq of dlqs) {
            try {
                await this.retry(dlq.uuid);
                results.success++;
            } catch (error) {
                results.failed++;
            }
        }

        logWithContext("info", "[DLQ] Bulk retry completed", results);

        return results;
    }

    //Get DLQ items

    static async getAll(filters?: {
        provider?: string;
        status?: string;
        eventType?: string;
        dateFrom?: Date;
        dateTo?: Date;
        page?: number;
        limit?: number;
    }) {
        const page = filters?.page || 1;
        const limit = filters?.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (filters?.provider) where.provider = filters.provider;
        if (filters?.status) where.status = filters.status;
        if (filters?.eventType) where.eventType = filters.eventType;
        if (filters?.dateFrom || filters?.dateTo) {
            where.createdAt = {};
            if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
            if (filters.dateTo) where.createdAt.lte = filters.dateTo;
        };

        const [items, total] = await Promise.all([
            prisma.webhookDeadLetter.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.webhookDeadLetter.count({ where }),
        ]);

        return {
            data: items,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

  
    //Abandon webhook (no more retries)
    static async abandon(dlqUuid: string, reason?: string) {
        await prisma.webhookDeadLetter.update({
            where: { uuid: dlqUuid },
            data: {
                status: "ABANDONED",
                errorMessage: reason || "Manually abandoned",
            },
        });

        logWithContext("warn", "[DLQ] Webhook abandoned", {
            dlqUuid,
            reason,
        });

        MetricsService.increment("webhook.dlq.abandoned", 1);
    }

    private static getHandlerForProvider(provider: string): (payload: any) => Promise<void> {
        switch (provider.toLowerCase()) {
            case "stripe":
                const { StripeWebhookHandler } = require("@/handlers/webhooks/StripeWebhook.handler");
                return StripeWebhookHandler.process;

            case "evc_plus":
                const { EVCWebhookHandler } = require("@/handlers/webhooks/EVCWebhook.handler");
                return EVCWebhookHandler.process;

            default:
                throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
        }
    }
}