import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { redis } from "../lib/redis.ts";


export const cache = (keyGenerator: (req: Request) => string, ttlSeconds = 60) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const cacheKey = keyGenerator(req);
    
            // Try to get from cache. Upstash auto-deserializes JSON, so the
            // value is already the response body.
            const cached = await redis.get<unknown>(cacheKey);
    
            if (cached !== null) {
                return res.json(cached);
            };
  
            // Cache miss - capture response
            const originalJson = res.json.bind(res);
    
            res.json = function (data: any) {
                // Store in cache asynchronously
                setImmediate(async () => {
                    try {
                        await redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
                    } catch (error: any) {
                        logWithContext("error", "[Cache] Failed to cache", {
                            error: error.message,
                        });
                    }
                });
        
                return originalJson(data);
            };
    
            next();
        } catch (error: any) {
            logWithContext("error", "[Cache] Cache middleware error", {
                error: error.message,
            });
    
            // Continue without cache
            next();
        }
    };
};
  