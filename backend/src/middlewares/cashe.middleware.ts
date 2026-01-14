import type { Request, Response, NextFunction } from "express";
import {redisClient} from "../lib/redis.ts"

export const cache= 
  (key : string, ttlSeconds= 60)=>{
    async (req: Request, res: Response, next: NextFunction)=>{
        try {
            const cached= await redisClient.get(key);
            if (cached) {
                return res.json(cached);
            };

            const originalJson= res.json.bind(res);
            res.json = (data: any) => {
                redisClient.set(key, JSON.stringify(data), { ex: ttlSeconds });
                return originalJson(data);
            };
            
            next()
        } catch (err) {
            console.error("Redis cache error:", err);
            next();
        }
    }
}