import type { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { MetricsService } from "../infrastructure/observability/MetricsService.ts";

  
interface RateLimitConfig {
    windowMs: number;    // Time window in milliseconds
    maxAttempts: number;  // Max attempts within window
    keyPrefix: string;    // Redis key prefix
    keyExtractor: (req: Request) => string; // How to identify the requester
    message?: string;
}
 
function createRateLimiter(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = `ratelimit:${config.keyPrefix}:${config.keyExtractor(req)}`;
    
        try {
            const current = await redis.incr(key);
        
            if (current === 1) {
                // First request in window — set expiry
                await redis.pexpire(key, config.windowMs);
            }
        
            // Set rate limit headers
            res.setHeader("X-RateLimit-Limit", config.maxAttempts);
            res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxAttempts - current));
        
            if (current > config.maxAttempts) {
                const ttl = await redis.pttl(key);
                res.setHeader("Retry-After", Math.ceil(ttl / 1000));
        
                logWithContext("warn", "[RateLimit] Blocked", {
                    prefix: config.keyPrefix,
                    key: config.keyExtractor(req),
                    attempts: current,
                    limit: config.maxAttempts,
                });
        
                MetricsService.increment("security.rate_limit_hit", 1, {
                    endpoint: config.keyPrefix,
                });
        
                return res.status(429).json({
                    success: false,
                    error: "RATE_LIMITED",
                    message: config.message || "Too many attempts. Please try again later.",
                    retryAfter: Math.ceil(ttl / 1000),
                });
            }
        
            next();
        } catch (error: any) {
            // If Redis fails, let the request through (fail open for auth)
            // but log it for monitoring
            logWithContext("error", "[RateLimit] Redis error — failing open", {
                error: error.message,
            });
            next();
        }
    };
}
 
// ── Extractors ──────────────────────────────────────────────────────────
 
function getIP(req: Request): string {
    return (
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown"
    );
}
 
function getUserFromToken(req: Request): string {
    // For token rotation, extract user from the refresh token body
    return (req as any).user?.uuid || req.body?.userUuid || getIP(req);
}
 
// ── Pre-configured limiters
 
// Login/OTP: 5 attempts per IP per 15 minutes
export const loginRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    keyPrefix: "login",
    keyExtractor: getIP,
    message: "Too many login attempts. Please try again in 15 minutes.",
});
 
// OTP verification: 5 attempts per phone per 15 minutes
export const otpRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    keyPrefix: "otp",
    keyExtractor: (req) => req.body?.phoneNumber || getIP(req),
    message: "Too many OTP attempts. Please try again in 15 minutes.",
});
 
// Token rotation: 20 per user per 15 minutes (higher — mobile apps rotate frequently)
export const tokenRotateRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxAttempts: 20,
    keyPrefix: "rotate",
    keyExtractor: getUserFromToken,
    message: "Too many token rotation attempts.",
});
 
// Password reset: 3 per IP per hour
export const passwordResetRateLimit = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxAttempts: 3,
    keyPrefix: "pwreset",
    keyExtractor: getIP,
    message: "Too many password reset attempts. Please try again in 1 hour.",
});
 
// Password change: 5 per user per hour
export const passwordChangeRateLimit = createRateLimiter({
        windowMs: 60 * 60 * 1000,
        maxAttempts: 5,
        keyPrefix: "pwchange",
        keyExtractor: (req) => (req as any).user?.uuid || getIP(req),
        message: "Too many password change attempts.",
});
 
// Generic API rate limit: 100 per IP per minute (for general protection)
export const apiRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: 100,
    keyPrefix: "api",
    keyExtractor: getIP,
    message: "Too many requests. Please slow down.",
});
 