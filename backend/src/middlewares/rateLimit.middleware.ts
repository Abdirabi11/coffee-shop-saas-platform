import type { Request, Response, NextFunction } from "express";
import { hitRateLimitWindow } from "../lib/rateLimitWindow.ts"

export const rateLimit= ({
    keyPrefix,
    limit,
    windowSeconds,
}: {
    keyPrefix: string;
    limit: number;
    windowSeconds: number;
})=>{
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userUuid= (req as any).user?.userUuid;
            const ip = req.ip;

            const identifier = userUuid || ip;
            const key = `ratelimit:${keyPrefix}:${identifier}`;

            const { count: current } = await hitRateLimitWindow(key, windowSeconds * 1000);

            if (current > limit) {
                return res.status(429).json({
                  message: "Too many requests. Please slow down.",
                });
            };
            next();
        } catch (err) {
            console.error("[RATE_LIMIT_FAILED]");
            next();
        }
    };
};
