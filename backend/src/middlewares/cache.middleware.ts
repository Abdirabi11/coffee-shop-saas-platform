import type { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { redis } from "../lib/redis.js";


export const cache = (keyGenerator: (req: Request) => string, ttlSeconds = 60) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const cacheKey = keyGenerator(req);
    
            // Try to get from cache
            const cached = await redis.get(cacheKey);
    
            if (cached) {
                logWithContext("debug", "[Cache] Cache hit", { key: cacheKey });
                return res.json(JSON.parse(cached));
            };
  
            // Cache miss - capture response
            const originalJson = res.json.bind(res);
    
            res.json = function (data: any) {
                // Store in cache asynchronously
                setImmediate(async () => {
                    try {
                        await redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
                        logWithContext("debug", "[Cache] Cached response", { key: cacheKey });
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
  