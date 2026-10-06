import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { hitRateLimitWindow } from "../lib/rateLimitWindow.ts";

// Each caller gets its own bucket inside its tenant: keying on the tenant
// alone let one busy client (e.g. a kitchen display polling) exhaust the
// limit for every user of the store. The caller is the authenticated user,
// else the IP. The client-sent x-device-id is not used, since rotating it
// would hand out fresh buckets.
export const rateLimitByTenant = ({
    points,
    duration,
    keyPrefix = "order",
    methods,
  }: {
    points: number; // Max requests per caller
    duration: number; // Window in seconds
    keyPrefix?: string;
    methods?: string[]; // Only count these HTTP methods (default: all)
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (methods && !methods.includes(req.method)) {
            return next();
        }

        try {
            // Get tenant UUID (should be set by requireTenantContext middleware)
            const tenantUuid = req.tenant?.uuid;
            const caller = req.user?.userUuid
                ? `user:${req.user.userUuid}`
                : req.ip ? `ip:${req.ip}` : undefined;

            const identifier = caller && `${tenantUuid ?? "public"}:${caller}`;

            if (!identifier) {
                logWithContext("warn", "[RateLimit] No identifier found, allowing request", {});
                return next();
            };

            const key = `ratelimit:${keyPrefix}:${identifier}`;

            // Increment counter and guarantee a TTL in one round-trip
            const window = await hitRateLimitWindow(key, duration * 1000);
            const current = window.count;
            const ttl = Math.ceil(window.ttlMs / 1000);

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
            const userUuid = req.user?.userUuid;
            const ip = req.ip;

            const identifier = userUuid || ip;
            const key = `ratelimit:${keyPrefix}:${identifier}`;

            const window = await hitRateLimitWindow(key, duration * 1000);
            const current = window.count;
            const ttl = Math.ceil(window.ttlMs / 1000);

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