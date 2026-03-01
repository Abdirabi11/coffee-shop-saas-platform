import { Request, Response, NextFunction } from "express";
import { QuotaService } from "../services/billing/Quota.service.ts";
import { logWithContext } from "../infrastructure/observability/logger.ts";

export const checkQuota = (quotaKey: string, amount: number = 1) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantUuid = req.tenant?.uuid;

            if (!tenantUuid) {
                return res.status(403).json({
                error: "TENANT_REQUIRED",
                message: "Tenant context required",
                });
            }

            const quotaCheck = await QuotaService.checkQuota({
                tenantUuid,
                quotaKey,
                amount,
            });

            if (!quotaCheck.allowed) {
                logWithContext("warn", "[QuotaGuard] Quota exceeded", {
                    tenantUuid,
                    quotaKey,
                    remaining: quotaCheck.remaining,
                    limit: quotaCheck.limit,
                });

                return res.status(429).json({
                    error: "QUOTA_EXCEEDED",
                    message: `You have reached your ${quotaKey} limit`,
                    quota: {
                        key: quotaKey,
                        limit: quotaCheck.limit,
                        remaining: quotaCheck.remaining,
                    },
                });
            };

            // Store quota info in request for later increment
            (req as any).quotaInfo = {
                quotaKey,
                amount,
            };

            next();

        } catch (error: any) {
            logWithContext("error", "[QuotaGuard] Quota check failed", {
                error: error.message,
            });

            next();
        }
    };
}

export const incrementQuotaAfter = async (req: Request) => {
    const quotaInfo = (req as any).quotaInfo;
    const tenantUuid = req.tenant?.uuid;

    if (quotaInfo && tenantUuid) {
        await QuotaService.incrementQuota({
            tenantUuid,
            quotaKey: quotaInfo.quotaKey,
            amount: quotaInfo.amount,
        });
    };
};
