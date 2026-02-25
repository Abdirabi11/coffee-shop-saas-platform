import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis.js";

export const trackTenantUsage = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant?.uuid) {
      return next();
    }
  
    // Track API usage per tenant
    await redis.hincrby(`tenant:${req.tenant.uuid}:api_usage`, req.method, 1);
    
    next();
};