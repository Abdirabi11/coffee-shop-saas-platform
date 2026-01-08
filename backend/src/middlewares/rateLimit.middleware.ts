import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis.ts"

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

            const current= await redis.incr(key);

            if (current === 1) {
                await redis.expire(key, windowSeconds);
            };

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
