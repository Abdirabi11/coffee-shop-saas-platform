import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { PlanService } from "../../services/billing/Plan.service.ts";
import { addPlanFeatureSchema, addPlanPriceSchema, addPlanQuotaSchema, createPlanSchema, updatePlanSchema } from "../../validators/plan.validator.ts";

export class PlanController{
    //GET /api/plans
    static async listPlans(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `plan_${Date.now()}`;

        try {
            const { tier, planType, isPublic } = req.query;

            const plans = await PlanService.listActivePlans({
                tier: tier as string,
                planType: planType as string,
                isPublic: isPublic === "true" ? true : undefined,
            });

            return res.status(200).json({
                success: true,
                plans,
            });

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to list plans", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to list plans",
            });
        }
    }

    //GET /api/plans/:planUuid
    static async getPlan(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            const plan = await PlanService.getPlan(planUuid);

            return res.status(200).json({
                success: true,
                plan,
            });
        } catch (error: any) {
            if (error.message === "PLAN_NOT_FOUND") {
                return res.status(404).json({
                    error: "PLAN_NOT_FOUND",
                    message: "Plan not found",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get plan",
            });
        }
    }

    //GET /api/plans/slug/:slug
    static async getPlanBySlug(req: Request, res: Response) {
        try {
            const { slug } = req.params;

            const plan = await PlanService.getPlanBySlug(slug);

            return res.status(200).json({
                success: true,
                plan,
            });
        } catch (error: any) {
            if (error.message === "PLAN_NOT_FOUND") {
                return res.status(404).json({
                error: "PLAN_NOT_FOUND",
                message: "Plan not found",
                });
            };

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get plan",
            });
        }
    }

    //POST /api/plans   
    static async createPlan(req: Request, res: Response) {
        try {
            const validation = createPlanSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validation.error.errors,
                });
            };

            const plan = await PlanService.createPlan({
                ...validation.data,
                createdBy: req.user!.uuid,
            });

            return res.status(201).json({
                success: true,
                plan,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create plan",
            });
        }
    }

    //PATCH /api/plans/:planUuid
    static async updatePlan(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            const validation = updatePlanSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                details: validation.error.errors,
                });
            };

            const plan = await PlanService.updatePlan({
                planUuid,
                data: validation.data,
                updatedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                plan,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update plan",
            });
        }
    }

    //POST /api/plans/:planUuid/prices
    static async addPlanPrice(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            const validation = addPlanPriceSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                details: validation.error.errors,
                });
            };

            const price = await PlanService.addPlanPrice({
                planUuid,
                ...validation.data,
            });

            return res.status(201).json({
                success: true,
                price,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to add plan price",
            });
        }
    }

    //POST /api/plans/:planUuid/features
    static async addPlanFeature(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            const validation = addPlanFeatureSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                details: validation.error.errors,
                });
            }

            const feature = await PlanService.addPlanFeature({
                planUuid,
                ...validation.data,
            });

            return res.status(201).json({
                success: true,
                feature,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to add plan feature",
            });
        }
    }

    //POST /api/plans/:planUuid/quotas
    static async addPlanQuota(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            const validation = addPlanQuotaSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                details: validation.error.errors,
                });
            }

            const quota = await PlanService.addPlanQuota({
                planUuid,
                ...validation.data,
            });

            return res.status(201).json({
                success: true,
                quota,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to add plan quota",
            });
        }
    }

    //POST /api/plans/:planUuid/versions
    static async createPlanVersion(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;
            const { priceMonthly, features, quotas, changeDescription } = req.body;

            const version = await PlanService.createPlanVersion({
                planUuid,
                priceMonthly,
                features,
                quotas,
                changeDescription,
                changedBy: req.user!.uuid,
            });

            return res.status(201).json({
                success: true,
                version,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create plan version",
            });
        }
    }

    //POST /api/plans/:planUuid/enable
    static async enablePlan(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            await PlanService.setPlanStatus({
                planUuid,
                isActive: true,
                updatedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                message: "Plan enabled",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to enable plan",
            });
        }
    }

    //POST /api/plans/:planUuid/disable
    static async disablePlan(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;

            await PlanService.setPlanStatus({
                planUuid,
                isActive: false,
                updatedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                message: "Plan disabled",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to disable plan",
            });
        }
    }

   //POST /api/plans/compare
    static async comparePlans(req: Request, res: Response) {
        try {
            const { planUuids } = req.body;

            if (!Array.isArray(planUuids) || planUuids.length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "planUuids must be a non-empty array",
                });
            }

            const comparison = await PlanService.comparePlans(planUuids);

            return res.status(200).json({
                success: true,
                comparison,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to compare plans",
            });
        }
    }

   //GET /api/plans/:planUuid/analytics
    static async getPlanAnalytics(req: Request, res: Response) {
        try {
            const { planUuid } = req.params;
            const { dateFrom, dateTo } = req.query;

            const analytics = await PlanService.getPlanAnalytics(
                planUuid,
                new Date(dateFrom as string),
                new Date(dateTo as string)
            );

            return res.status(200).json({
                success: true,
                analytics,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get plan analytics",
            });
        }
    }
}