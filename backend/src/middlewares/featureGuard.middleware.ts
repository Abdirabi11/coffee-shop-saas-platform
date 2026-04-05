import { Request, Response, NextFunction } from "express";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { FeatureService } from "../services/billing/Feature.service.ts";

export const requireFeature = (featureKey: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantUuid = req.tenant?.uuid;

            if (!tenantUuid) {
                return res.status(403).json({
                    error: "TENANT_REQUIRED",
                    message: "Tenant context required",
                });
            }

            const hasFeature = await FeatureService.hasFeature({
                tenantUuid,
                featureKey,
            });

            if (!hasFeature) {
                logWithContext("warn", "[FeatureGuard] Feature not available", {
                tenantUuid,
                featureKey,
            });

            return res.status(403).json({
                error: "FEATURE_NOT_AVAILABLE",
                message: `This feature is not available in your current plan`,
                featureKey,
            });
        }

            next();

        } catch (error: any) {
            logWithContext("error", "[FeatureGuard] Feature check failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Feature check failed",
            });
        }
    };
};