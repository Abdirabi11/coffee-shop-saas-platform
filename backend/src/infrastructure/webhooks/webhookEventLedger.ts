import { Prisma, type WebhookProvider } from "@prisma/client";
import prisma from "../../config/prisma.ts";

// A PROCESSING claim older than this is treated as abandoned (the worker
// crashed mid-event) and may be taken over by the provider's next retry.
const STALE_CLAIM_MS = 5 * 60 * 1000;

export type WebhookClaim =
    | { outcome: "CLAIMED" }
    | { outcome: "DUPLICATE" }     // already handled: acknowledge, do nothing
    | { outcome: "IN_PROGRESS" };  // another worker holds it: ask provider to retry

interface ClaimInput {
    provider: WebhookProvider;
    eventId: string;          // the VERIFIED provider event id, never a header
    eventType: string;
    payload: unknown;
    sourceIp: string;
    userAgent?: string;
    signatureHeader?: string;
}

// Exactly-once processing for provider webhooks, keyed on
// @@unique([provider, providerEventId]). The row is inserted BEFORE any side
// effects, so two concurrent deliveries of the same event can't both pass:
// the second insert hits the unique constraint.
export class WebhookEventLedger {
    static async claim(input: ClaimInput): Promise<WebhookClaim> {
        const payloadJson = JSON.stringify(input.payload ?? {});

        try {
            await prisma.webhookEvent.create({
                data: {
                    provider: input.provider,
                    providerEventId: input.eventId,
                    providerEventUuid: input.eventId,
                    eventUuid: input.eventId,
                    eventType: input.eventType,
                    sourceIp: input.sourceIp,
                    userAgent: input.userAgent,
                    payload: input.payload as Prisma.InputJsonValue,
                    payloadSize: payloadJson.length,
                    signatureHeader: input.signatureHeader,
                    signatureValid: true,
                    verifiedAt: new Date(),
                    status: "PROCESSING",
                },
            });
            return { outcome: "CLAIMED" };
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
                throw error;
            }
        }

        // Seen before. Take it over only if the earlier attempt failed or was
        // abandoned; the conditional update makes the takeover atomic.
        const reclaimed = await prisma.webhookEvent.updateMany({
            where: {
                provider: input.provider,
                providerEventId: input.eventId,
                OR: [
                    { status: "FAILED" },
                    { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
                ],
            },
            data: {
                status: "PROCESSING",
                retryCount: { increment: 1 },
                lastRetryAt: new Date(),
                processingError: null,
            },
        });

        if (reclaimed.count === 1) {
            return { outcome: "CLAIMED" };
        }

        const existing = await prisma.webhookEvent.findUnique({
            where: {
                provider_providerEventId: {
                    provider: input.provider,
                    providerEventId: input.eventId,
                },
            },
            select: { status: true },
        });

        return existing?.status === "PROCESSING"
            ? { outcome: "IN_PROGRESS" }
            : { outcome: "DUPLICATE" };
    }

    static async complete(
        provider: WebhookProvider,
        eventId: string,
        status: "PROCESSED" | "IGNORED",
        result?: Record<string, unknown>
    ) {
        await prisma.webhookEvent.update({
            where: { provider_providerEventId: { provider, providerEventId: eventId } },
            data: {
                status,
                processedAt: new Date(),
                resultActions: (result ?? {}) as Prisma.InputJsonValue,
            },
        });
    }

    static async fail(provider: WebhookProvider, eventId: string, error: string) {
        await prisma.webhookEvent.update({
            where: { provider_providerEventId: { provider, providerEventId: eventId } },
            data: { status: "FAILED", processingError: error },
        });
    }
}
