import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"
import { logWithContext } from "../infrastructure/observability/Logger.ts";


export const preventReplayAttack= async (
    req: Request,
    res: Response,
    next: NextFunction
)=>{
    const eventUuid = req.headers["x-event-id"] as string;
    const provider = req.headers["x-provider"] as string;

    if (!eventUuid || !provider) {
        return res.status(400).json({
            error: "MISSING_EVENT_HEADERS",
            message: "x-event-id and x-provider headers required",
        });
    };

    try {
        // Check if event already processed
        const exists = await prisma.webhookEvent.findUnique({
            where: {
                provider_eventUuid: {
                    provider,
                    eventUuid,
                },
            },
        });

        if (exists) {
            logWithContext("warn", "[ReplayProtection] Replay attack detected", {
                provider,
                eventUuid,
            });

            return res.status(409).json({
                error: "REPLAY_DETECTED",
                message: "This event has already been processed",
            });
        };

        // Store event ID
        await prisma.webhookEvent.create({
            data: {
                provider,
                eventUuid,
                processedAt: new Date(),
            },
        });

        next();
    } catch (error: any) {
        logWithContext("error", "[ReplayProtection] Failed to check replay", {
            error: error.message,
        });

        return res.status(500).json({
            error: "INTERNAL_SERVER_ERROR",
            message: "Replay protection check failed",
        });
    }
};

// Payment webhooks
// POST /webhooks/payments

// Refund provider callbacks
// POST /webhooks/refunds

// Any async provider notification
// POST /webhooks/*