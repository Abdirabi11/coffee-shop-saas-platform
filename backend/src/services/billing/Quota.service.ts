import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class QuotaService {
    static async initializeQuotas(tenantUuid: string, planUuid: string) {
        const quotas = await prisma.planQuota.findMany({
            where: {
                planUuid,
                enforced: true,
            },
        });

        for (const quota of quotas) {
            await prisma.usageQuota.upsert({
                where: {
                    tenantUuid_quotaKey: {
                    tenantUuid,
                    quotaKey: quota.quotaKey,
                    },
                },
                update: {
                    limit: quota.limit,
                    resetInterval: quota.resetInterval,
                },
                create: {
                    tenantUuid,
                    quotaKey: quota.quotaKey,
                    quotaName: quota.quotaName,
                    limit: quota.limit,
                    used: 0,
                    resetInterval: quota.resetInterval,
                },
            });
        }

        logWithContext("info", "[Quota] Initialized quotas", {
            tenantUuid,
            planUuid,
            quotaCount: quotas.length,
        });
    }

    //Check quota
    static async checkQuota(input: {
        tenantUuid: string;
        quotaKey: string;
        amount?: number;
    }): Promise<{
        allowed: boolean;
        remaining: number;
        limit: number;
    }> {
        try {
            const quota = await prisma.usageQuota.findUnique({
                where: {
                    tenantUuid_quotaKey: {
                        tenantUuid: input.tenantUuid,
                        quotaKey: input.quotaKey,
                    },
                },
            });
        
            if (!quota) {
                // No quota = unlimited
                return {
                    allowed: true,
                    remaining: Infinity,
                    limit: Infinity,
                };
            };
        
            const amount = input.amount || 1;
            const remaining = quota.limit - quota.used;
            const allowed = quota.used + amount <= quota.limit;
        
            return {
                allowed,
                remaining,
                limit: quota.limit,
            };
        } catch (error: any) {
            logWithContext("error", "[Quota] Failed to check quota", {
                error: error.message,
            });
        
            // Fail open - allow on error
            return {
                allowed: true,
                remaining: 0,
                limit: 0,
            };
        }
    }

    //Increment quota usage
    static async incrementQuota(input: {
        tenantUuid: string;
        quotaKey: string;
        amount?: number;
    }) {
        try {
            const amount = input.amount || 1;

            const quota = await prisma.usageQuota.update({
                where: {
                    tenantUuid_quotaKey: {
                        tenantUuid: input.tenantUuid,
                        quotaKey: input.quotaKey,
                    },
                },
                data: {
                    used: { increment: amount },
                    lastUsedAt: new Date(),
                },
            });

            // Check if near limit (90%)
            const usagePercent = (quota.used / quota.limit) * 100;

            if (usagePercent >= 90 && usagePercent < 100) {
                EventBus.emit("QUOTA_NEARLY_EXCEEDED", {
                    tenantUuid: input.tenantUuid,
                    quotaKey: input.quotaKey,
                    used: quota.used,
                    limit: quota.limit,
                    usagePercent,
                });
            };

            // Check if exceeded
            if (quota.used >= quota.limit) {
                EventBus.emit("QUOTA_EXCEEDED", {
                    tenantUuid: input.tenantUuid,
                    quotaKey: input.quotaKey,
                    used: quota.used,
                    limit: quota.limit,
                });
            };
        } catch (error: any) {
            logWithContext("error", "[Quota] Failed to increment", {
                error: error.message,
            });
        }
    }

    //Decrement quota usage
    static async decrementQuota(input: {
        tenantUuid: string;
        quotaKey: string;
        amount?: number;
    }) {
        try {
            const amount = input.amount || 1;

            await prisma.usageQuota.update({
                where: {
                    tenantUuid_quotaKey: {
                        tenantUuid: input.tenantUuid,
                        quotaKey: input.quotaKey,
                    },
                },
                data: {
                    used: { decrement: amount },
                },
            });

        } catch (error: any) {
            logWithContext("error", "[Quota] Failed to decrement", {
                error: error.message,
            });
        }
    }

    //Get tenant quotas
    static async getTenantQuotas(tenantUuid: string) {
        const quotas = await prisma.usageQuota.findMany({
            where: { tenantUuid },
        });
      
        return quotas.map((q) => ({
            quotaKey: q.quotaKey,
            quotaName: q.quotaName,
            used: q.used,
            limit: q.limit,
            remaining: q.limit - q.used,
            usagePercent: Math.round((q.used / q.limit) * 100),
            resetInterval: q.resetInterval,
            lastResetAt: q.lastResetAt,
        }));
    }

    //Reset quotas
    static async resetQuotas(resetInterval: "DAILY" | "MONTHLY" | "YEARLY") {
        const quotas = await prisma.usageQuota.findMany({
            where: { resetInterval },
        });
      
        for (const quota of quotas) {
            await prisma.usageQuota.update({
                where: { uuid: quota.uuid },
                data: {
                    used: 0,
                    lastResetAt: new Date(),
                },
            });
        }
      
        logWithContext("info", "[Quota] Reset quotas", {
            resetInterval,
            count: quotas.length,
        });
    }
}