import prisma from "../config/prisma.ts"
import { redisClient, redis } from "../lib/redis.ts";

export const checkTenantQuota= async (
    tenantUuid: string,
    scope: "DASHBOARD" | "REPORTS" | "EXPORTS"
)=>{
    const quota= await prisma.tenantQuota.findUnique({
        where: { tenantUuid, scope }
    });
    if(!quota)return { allowed: true };

    const key= `tenant:${tenantUuid}:requests`;
    const current= await redisClient.incr(key);

    if (current === 1) {
        await redis.expire(key, quota.windowSeconds);
    };
    if (current > quota.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetIn: await redis.ttl(key),
        };
    };

    return {
        allowed: true,
        remaining: quota.maxRequests - current,
    };
};