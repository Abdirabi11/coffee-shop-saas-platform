import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";

const rateLimiters = new Map<string, RateLimiterMemory>();

function getRateLimiter(provider: string): RateLimiterMemory {
    if (!rateLimiters.has(provider)) {
        rateLimiters.set(
            provider,
            new RateLimiterMemory({
                points: 100,      
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
    try {
        const provider = req.path.split("/").pop() || "unknown"; // e.g., /webhooks/stripe
        const identifier = `${provider}:${req.ip}`;
    
        const rateLimiter = getRateLimiter(provider);
    
        await rateLimiter.consume(identifier, 1);
    
        // Add rate limit headers
        res.setHeader("X-RateLimit-Limit", "100");
        res.setHeader("X-RateLimit-Remaining", await rateLimiter.get(identifier).then(r => r?.remainingPoints || 100));
    
        next();
    } catch (error: any) {
        if (error instanceof Error && error.name === "RateLimiterError") {
            return res.status(429).json({
            error: "Too many webhook requests",
            retryAfter: Math.round(error.msBeforeNext / 1000),
            });
        };
  
        next(error);
    }
};