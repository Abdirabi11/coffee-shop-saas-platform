import { Request, Response } from "express";
import { SubscriptionService } from "../../services/billing/Subscription.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { QuotaService } from "../../services/billing/Quota.service.ts";
import { FeatureService } from "../../services/billing/Feature.service.ts";

export class SubscriptionController{

    //GET /api/subscriptions/current
    static async getCurrentSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const subscription = await SubscriptionService.getTenantSubscription(tenantUuid);

            if (!subscription) {
                return res.status(404).json({
                    error: "NO_SUBSCRIPTION",
                    message: "No active subscription found",
                });
            }

            return res.status(200).json({
                success: true,
                subscription,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get subscription",
            });
        }
    }

    //POST /api/subscriptions
    static async createSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { planUuid, planVersionUuid, interval, startTrial } = req.body;

            if (!planUuid || !planVersionUuid || !interval) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "planUuid, planVersionUuid, and interval are required",
                });
            }

            const subscription = await SubscriptionService.createSubscription({
                tenantUuid,
                planUuid,
                planVersionUuid,
                interval,
                startTrial,
            });

            return res.status(201).json({
                success: true,
                subscription,
            });
        } catch (error: any) {
            logWithContext("error", "[Subscription] Failed to create", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create subscription",
            });
        }
    }

    //POST /api/subscriptions/change-plan
    static async changePlan(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { newPlanUuid, newPlanVersionUuid, prorated } = req.body;

            if (!newPlanUuid || !newPlanVersionUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "newPlanUuid and newPlanVersionUuid are required",
                });
            }

            const subscription = await SubscriptionService.changePlan({
                tenantUuid,
                newPlanUuid,
                newPlanVersionUuid,
                prorated,
            });

            return res.status(200).json({
                success: true,
                subscription,
            });

        } catch (error: any) {
            if (error.message.includes("DOWNGRADE_NOT_ALLOWED")) {
                return res.status(400).json({
                    error: "DOWNGRADE_NOT_ALLOWED",
                    message: error.message,
                });
            };

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to change plan",
            });
        }
    }

    //POST /api/subscriptions/cancel
    static async cancelSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { immediately, reason } = req.body;

            await SubscriptionService.cancelSubscription({
                tenantUuid,
                immediately,
                reason,
                cancelledBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                message: immediately
                ? "Subscription cancelled immediately"
                : "Subscription will cancel at end of period",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to cancel subscription",
            });
        }
    }

    //POST /api/subscriptions/reactivate
    static async reactivateSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            await SubscriptionService.reactivateSubscription(tenantUuid);

            return res.status(200).json({
                success: true,
                message: "Subscription reactivated",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to reactivate subscription",
            });
        }
    }

    //GET /api/subscriptions/quotas
    static async getQuotas(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const quotas = await QuotaService.getTenantQuotas(tenantUuid);

            return res.status(200).json({
                success: true,
                quotas,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get quotas",
            });
        }
    }

    //GET /api/subscriptions/features
    static async getFeatures(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const features = await FeatureService.getTenantFeatures(tenantUuid);

            return res.status(200).json({
                success: true,
                features,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get features",
            });
        }
    }

}