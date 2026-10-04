import type { Request, Response, NextFunction } from "express";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const WEBHOOK_POINTS = 100;

// Limiter instances are keyed by provider. Only known providers get their own
// instance so a crafted path can't grow this map.
const KNOWN_PROVIDERS = new Set(["stripe", "evc"]);
const rateLimiters = new Map<string, RateLimiterMemory>();

function getRateLimiter(provider: string): RateLimiterMemory {
    if (!rateLimiters.has(provider)) {
        rateLimiters.set(
            provider,
            new RateLimiterMemory({
                points: WEBHOOK_POINTS,
                duration: 60,
                blockDuration: 60,
            })
        );
    };
    return rateLimiters.get(provider)!;
};

export async function webhookRateLimit(
    req: Request,
    res: Response,
    next: NextFunction
    ){
    const segment = req.path.split("/").pop() || ""; // e.g., /webhooks/stripe
    const provider = KNOWN_PROVIDERS.has(segment) ? segment : "unknown";
    const identifier = `${provider}:${req.ip}`;

    try {
        const result = await getRateLimiter(provider).consume(identifier, 1);

        res.setHeader("X-RateLimit-Limit", String(WEBHOOK_POINTS));
        res.setHeader("X-RateLimit-Remaining", String(result.remainingPoints));

        next();
    } catch (error: unknown) {
        // rate-limiter-flexible rejects with a RateLimiterRes (not an Error)
        // when the limit is hit; real Errors are store failures.
        if (error instanceof RateLimiterRes) {
            const retryAfter = Math.ceil(error.msBeforeNext / 1000);
            res.setHeader("Retry-After", String(retryAfter));
            res.setHeader("X-RateLimit-Limit", String(WEBHOOK_POINTS));
            res.setHeader("X-RateLimit-Remaining", "0");
            return res.status(429).json({
                error: "Too many webhook requests",
                retryAfter,
            });
        };

        next(error);
    }
};
