import { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { redis } from "../lib/redis.ts";

export const rateLimitByTenant = ({
    points,
    duration,
    keyPrefix = "order",
  }: {
    points: number; // Max requests
    duration: number; // Window in seconds
    keyPrefix?: string;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get tenant UUID (should be set by requireTenantContext middleware)
            const tenantUuid = req.tenant?.uuid;
            const userUuid = req.user?.uuid;
            const ip = req.ip;

            // Build identifier (prefer tenant > user > IP)
            const identifier = tenantUuid || userUuid || ip;

            if (!identifier) {
                logWithContext("warn", "[RateLimit] No identifier found, allowing request");
                return next();
            };

            const key = `ratelimit:${keyPrefix}:${identifier}`;

            // Increment counter
            const current = await redis.incr(key);

            // Set expiry on first request
            if (current === 1) {
                await redis.expire(key, duration);
            };

            // Get TTL for response headers
            const ttl = await redis.ttl(key);

            // Set rate limit headers
            res.set({
                "X-RateLimit-Limit": String(points),
                "X-RateLimit-Remaining": String(Math.max(0, points - current)),
                "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + ttl),
            });

            // Check if limit exceeded
            if (current > points) {
                logWithContext("warn", "[RateLimit] Rate limit exceeded", {
                    identifier,
                    tenantUuid,
                    current,
                    limit: points,
                });

                return res.status(429).json({
                    error: "RATE_LIMIT_EXCEEDED",
                    message: "Too many requests. Please try again later.",
                    retryAfter: ttl,
                });
            }

            next();
        } catch (error: any) {
            logWithContext("error", "[RateLimit] Rate limit check failed", {
                error: error.message,
            });
        
            // Fail open - allow request if Redis is down
            next();
        }
    }
};

//Per-user rate limiting (stricter)
export const rateLimitByUser = ({
    points,
    duration,
    keyPrefix = "user",
  }: {
    points: number;
    duration: number;
    keyPrefix?: string;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid = req.user?.uuid;
            const ip = req.ip;

            const identifier = userUuid || ip;
            const key = `ratelimit:${keyPrefix}:${identifier}`;

            const current = await redis.incr(key);

            if (current === 1) {
                await redis.expire(key, duration);
            }

            const ttl = await redis.ttl(key);

            res.set({
                "X-RateLimit-Limit": String(points),
                "X-RateLimit-Remaining": String(Math.max(0, points - current)),
                "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + ttl),
            });

            if (current > points) {
                return res.status(429).json({
                  error: "RATE_LIMIT_EXCEEDED",
                  message: "Too many requests. Please slow down.",
                  retryAfter: ttl,
                });
            };
        
            next();
        } catch (error: any) {
            logWithContext("error", "[RateLimit] User rate limit check failed", {
                error: error.message,
            });
        
            next();
        }
    }
};

//Burst protection (very short window)
export const burstProtection = ({
    points = 10,
    duration = 10,
  }: {
    points?: number;
    duration?: number;
} = {}) => {
    return rateLimitByUser({ points, duration, keyPrefix: "burst" });
};