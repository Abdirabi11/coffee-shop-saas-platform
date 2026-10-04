import prisma from "../config/prisma.ts"
import { hitRateLimitWindow } from "../lib/rateLimitWindow.ts";

export const checkTenantQuota= async (
    tenantUuid: string,
    scope: "DASHBOARD" | "REPORTS" | "EXPORTS"
)=>{
    const quota= await prisma.tenantQuota.findUnique({
        where: { tenantUuid, scope }
    });
    if(!quota)return { allowed: true };

    // Quotas are configured per scope, so count per scope too
    const key= `tenant:${tenantUuid}:requests:${scope}`;
    const { count: current, ttlMs }= await hitRateLimitWindow(key, quota.windowSeconds * 1000);

    if (current > quota.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetIn: Math.ceil(ttlMs / 1000),
        };
    };

    return {
        allowed: true,
        remaining: quota.maxRequests - current,
    };
};