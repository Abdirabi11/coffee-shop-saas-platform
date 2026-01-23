import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.ts"


export const preventReplayAttack= async (
    req: Request,
    res: Response,
    next: NextFunction
)=>{
    const eventUuid= req.headers["x-event-id"] as string;
    const provider = req.headers["x-provider"] as string;

    if (!eventId || !provider) {
        return res.status(400).json({ message: "Missing event headers" });
    };

    const exists= await prisma.webhookEvent.findUnique({
        where: {
            provider_eventUuid: {
                provider,
                eventUuid
            }
        }
    });
    if (exists) {
        return res.status(409).json({ message: "Replay detected" });
    };

    await prisma.webhookEvent.create({
        data: {
            provider,
            eventUuid,
        },
    })

    next()
};

// Payment webhooks
// POST /webhooks/payments

// Refund provider callbacks
// POST /webhooks/refunds

// Any async provider notification
// POST /webhooks/*