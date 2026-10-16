import type { WebhookProvider } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Providers whose stored events can be replayed
const REPLAYABLE: WebhookProvider[] = ["STRIPE"];

function replayableProvider(provider: string): WebhookProvider {
    const normalized = provider.toUpperCase() as WebhookProvider;
    if (!REPLAYABLE.includes(normalized)) throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
    return normalized;
}

export class WebhookReplayService {
    // eventId is the provider's own event id (e.g. Stripe's evt_...), as the
    // WebhookEventLedger stores it in providerEventId
    static async replayByEventId(provider: string, eventId: string) {
        const webhookProvider = replayableProvider(provider);

        const webhook = await prisma.webhookEvent.findUnique({
            where: {
                provider_providerEventId: {
                    provider: webhookProvider,
                    providerEventId: eventId,
                },
            },
        });

        if (!webhook) {
            throw new Error("WEBHOOK_EVENT_NOT_FOUND");
        }
        // A live delivery is mid-flight: replaying now could apply it twice
        if (webhook.status === "PROCESSING") {
            throw new Error("WEBHOOK_EVENT_IN_PROGRESS");
        }

        const replay = await prisma.webhookReplay.create({
            data: {
                webhookEventUuid: webhook.uuid,
                provider: webhook.provider,
                eventUuid: eventId,
                eventType: webhook.eventType,
                payload: webhook.payload ?? {},
                status: "PENDING",
            },
        });

        try {
            // Lazy ES-module import (the controller's dependencies import this file)
            const { PaymentWebhookController } = await import("../../controllers/payments/Paymentwebhook.controller.ts");
            const result = await PaymentWebhookController.replayStripeEvent(webhook.payload, `replay_${replay.uuid}`);

            const completed = await prisma.webhookReplay.update({
                where: { uuid: replay.uuid },
                data: {
                    status: "SUCCESS",
                    completedAt: new Date(),
                },
            });

            logWithContext("info", "[WebhookReplay] Replayed", {
                replayUuid: replay.uuid,
                webhookEventUuid: webhook.uuid,
                eventId,
                outcome: result.status,
            });

            return completed;

        } catch (error: any) {
            await prisma.webhookReplay.update({
                where: { uuid: replay.uuid },
                data: {
                    status: "FAILED",
                    errorMessage: error.message,
                    completedAt: new Date(),
                },
            });

            logWithContext("error", "[WebhookReplay] Replay failed", {
                replayUuid: replay.uuid,
                webhookEventUuid: webhook.uuid,
                eventId,
                error: error.message,
            });

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
        const provider = replayableProvider(input.provider);

        const webhooks = await prisma.webhookEvent.findMany({
            where: {
                provider,
                providerEventId: { not: null },
                ...(input.eventType && { eventType: input.eventType }),
                createdAt: {
                    gte: input.startDate,
                    lte: input.endDate,
                },
            },
            select: { providerEventId: true },
            orderBy: { createdAt: "asc" },
        });

        logWithContext("info", "[WebhookReplay] Replaying range", { provider, count: webhooks.length });

        const results = {
            total: webhooks.length,
            success: 0,
            failed: 0,
        };

        for (const webhook of webhooks) {
            try {
                await this.replayByEventId(provider, webhook.providerEventId!);
                results.success++;
            } catch {
                results.failed++;
            }
        }

        logWithContext("info", "[WebhookReplay] Range completed", { provider, ...results });
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
        return prisma.webhookReplay.findMany({
            where: {
                ...(filters?.provider && { provider: filters.provider.toUpperCase() }),
                ...(filters?.status && { status: filters.status as any }),
            },
            include: {
                webhookEvent: true,
            },
            orderBy: { createdAt: "desc" },
            take: Math.min(filters?.limit || 50, 200),
        })
    }
}
