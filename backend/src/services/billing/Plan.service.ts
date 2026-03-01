import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class PlanService{
    static async listActivePlans(filters?: {
        tier?: string;
        planType?: string;
        isPublic?: boolean;
    }) {
        try {
            const where: any = {
                isActive: true,
            };
        
            if (filters?.tier) where.tier = filters.tier;
            if (filters?.planType) where.planType = filters.planType;
            if (filters?.isPublic !== undefined) where.isPublic = filters.isPublic;
        
            const plans = await prisma.plan.findMany({
                where,
                include: {
                    prices: {
                        where: { isActive: true },
                        orderBy: { amount: "asc" },
                    },
                    features: {
                        orderBy: { displayOrder: "asc" },
                    },
                    quotas: {
                        where: { enforced: true },
                    },
                },
                orderBy: { displayOrder: "asc" },
            });
        
            return plans;
        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to list plans", {
                error: error.message,
            });
            throw error;
        }
    }

    //Get plan by UUID
    static async getPlan(planUuid: string) {
        const plan = await prisma.plan.findUnique({
            where: { uuid: planUuid },
            include: {
                prices: {
                    where: { isActive: true },
                    include: {
                        priceTiers: {
                        orderBy: { displayOrder: "asc" },
                        },
                    },
                },
                features: {
                    orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
                },
                quotas: true,
                versions: {
                    where: { isActive: true },
                    orderBy: { version: "desc" },
                    take: 1,
                },
            },
        });
    
        if (!plan) {
            throw new Error("PLAN_NOT_FOUND");
        }
 
        return plan;
    }

    //Get plan by slug
    static async getPlanBySlug(slug: string) {
        const plan = await prisma.plan.findUnique({
            where: { slug },
            include: {
                prices: {
                    where: { isActive: true },
                },
                features: {
                    orderBy: { displayOrder: "asc" },
                },
                quotas: true,
            },
        });

        if (!plan) {
            throw new Error("PLAN_NOT_FOUND");
        }

        return plan;
    }

   //Create plan
    static async createPlan(input: {
        name: string;
        description?: string;
        tier: "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
        planType?: "SUBSCRIPTION" | "ONE_TIME" | "USAGE_BASED";
        trialDays?: number;
        highlightedFeatures?: string[];
        createdBy: string;
    }) {
        try {
            // Generate slug
            const slug = await this.generateUniqueSlug(input.name);

            // Create plan
            const plan = await prisma.plan.create({
                data: {
                    name: input.name,
                    slug,
                    description: input.description,
                    tier: input.tier,
                    planType: input.planType || "SUBSCRIPTION",
                    trialDays: input.trialDays || 14,
                    highlightedFeatures: input.highlightedFeatures || [],
                    isActive: true,
                    isPublic: false, // Start as private
                },
            });

            logWithContext("info", "[Plan] Plan created", {
                planUuid: plan.uuid,
                name: plan.name,
                createdBy: input.createdBy,
            });

            MetricsService.increment("plan.created", 1);

            return plan;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to create plan", {
                error: error.message,
            });
            throw error;
        }
    }

    //Update plan
    static async updatePlan(input: {
        planUuid: string;
        data: {
            name?: string;
            description?: string;
            tagline?: string;
            highlightedFeatures?: string[];
            badges?: string[];
            ctaText?: string;
            displayOrder?: number;
        };
        updatedBy: string;
    }){
        try {
            const updates: any = { ...input.data };

            // Regenerate slug if name changed
            if (input.data.name) {
                updates.slug = await this.generateUniqueSlug(input.data.name, input.planUuid);
            }

            const plan = await prisma.plan.update({
                where: { uuid: input.planUuid },
                data: updates,
            });

            logWithContext("info", "[Plan] Plan updated", {
                planUuid: input.planUuid,
                updatedBy: input.updatedBy,
            });

            return plan;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to update plan", {
                error: error.message,
            });
            throw error;
        }
    }

    //Set plan status
    static async setPlanStatus(input: {
        planUuid: string;
        isActive: boolean;
        updatedBy: string;
    }) {
        await prisma.plan.update({
            where: { uuid: input.planUuid },
            data: { isActive: input.isActive },
        });

        logWithContext("info", "[Plan] Plan status changed", {
            planUuid: input.planUuid,
            isActive: input.isActive,
            updatedBy: input.updatedBy,
        });
    }

    //Add plan price
    static async addPlanPrice(input: {
        planUuid: string;
        currency: string;
        interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
        amount: number;
        region?: string;
        isDefault?: boolean;
    }) {
        try {
            const price = await prisma.planPrice.create({
                data: {
                    planUuid: input.planUuid,
                    currency: input.currency,
                    interval: input.interval,
                    intervalCount: 1,
                    amount: input.amount,
                    region: input.region,
                    isDefault: input.isDefault || false,
                    isActive: true,
                },
            });

            logWithContext("info", "[Plan] Price added", {
                planUuid: input.planUuid,
                priceUuid: price.uuid,
                amount: input.amount,
                interval: input.interval,
            });

            return price;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to add price", {
                error: error.message,
            });
            throw error;
        }
    }

    //Update plan price
    static async updatePlanPrice(input: {
        priceUuid: string;
        amount?: number;
        isActive?: boolean;
        isDefault?: boolean;
    }) {
        const price = await prisma.planPrice.update({
            where: { uuid: input.priceUuid },
            data: {
                amount: input.amount,
                isActive: input.isActive,
                isDefault: input.isDefault,
            },
        });

        return price;
    }

   //Add plan feature
    static async addPlanFeature(input: {
        planUuid: string;
        featureKey: string;
        featureName: string;
        description?: string;
        type: "BOOLEAN" | "QUANTITY" | "TEXT";
        enabled?: boolean;
        quantity?: number;
        textValue?: string;
        category?: string;
        highlight?: boolean;
    }){
        try {
            const feature = await prisma.planFeature.create({
                data: {
                    planUuid: input.planUuid,
                    featureKey: input.featureKey,
                    featureName: input.featureName,
                    description: input.description,
                    type: input.type,
                    enabled: input.enabled,
                    quantity: input.quantity,
                    textValue: input.textValue,
                    category: input.category,
                    highlight: input.highlight || false,
                },
            });

            logWithContext("info", "[Plan] Feature added", {
                planUuid: input.planUuid,
                featureKey: input.featureKey,
            });

            return feature;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to add feature", {
                error: error.message,
            });
            throw error;
        }
    }

   
    //Add plan quota
    static async addPlanQuota(input: {
        planUuid: string;
        quotaKey: string;
        quotaName: string;
        limit: number;
        limitType?: "HARD" | "SOFT";
        softLimit?: number;
        allowOverage?: boolean;
        overageFee?: number;
        resetInterval?: "DAILY" | "MONTHLY" | "YEARLY";
    }) {
        try {
            const quota = await prisma.planQuota.create({
                data: {
                    planUuid: input.planUuid,
                    quotaKey: input.quotaKey,
                    quotaName: input.quotaName,
                    limit: input.limit,
                    limitType: input.limitType || "HARD",
                    softLimit: input.softLimit,
                    allowOverage: input.allowOverage || false,
                    overageFee: input.overageFee,
                    resetInterval: input.resetInterval,
                    enforced: true,
                },
            });

            logWithContext("info", "[Plan] Quota added", {
                planUuid: input.planUuid,
                quotaKey: input.quotaKey,
                limit: input.limit,
            });

            return quota;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to add quota", {
                error: error.message,
            });
            throw error;
        }
    }

    //Create plan version
    static async createPlanVersion(input: {
        planUuid: string;
        priceMonthly: number;
        features: any;
        quotas?: any;
        changeDescription?: string;
        changedBy: string;
    }) {
        try {
            // Get latest version number
            const latestVersion = await prisma.planVersion.findFirst({
                where: { planUuid: input.planUuid },
                orderBy: { version: "desc" },
            });

            const newVersion = (latestVersion?.version || 0) + 1;

            // Deactivate old versions
            await prisma.planVersion.updateMany({
                where: {
                planUuid: input.planUuid,
                isActive: true,
                },
                data: { isActive: false },
            });

            // Create new version
            const version = await prisma.planVersion.create({
                data: {
                planUuid: input.planUuid,
                version: newVersion,
                priceMonthly: input.priceMonthly,
                features: input.features,
                quotas: input.quotas,
                changeDescription: input.changeDescription,
                changedBy: input.changedBy,
                isActive: true,
                effectiveFrom: new Date(),
                },
            });

            logWithContext("info", "[Plan] Version created", {
                planUuid: input.planUuid,
                version: newVersion,
                changedBy: input.changedBy,
            });

            return version;

        } catch (error: any) {
            logWithContext("error", "[Plan] Failed to create version", {
                error: error.message,
            });
            throw error;
        }
    }

    //Compare plans
    static async comparePlans(planUuids: string[]) {
        const plans = await prisma.plan.findMany({
            where: {
                uuid: { in: planUuids },
                isActive: true,
            },
            include: {
                prices: {
                    where: { isActive: true, interval: "MONTHLY" },
                    take: 1,
                },
                features: {
                    orderBy: { displayOrder: "asc" },
                },
                quotas: true,
            },
        });

       
        const featureCategories = new Set<string>();
            plans.forEach((plan) => {
            plan.features.forEach((f) => {
                if (f.category) featureCategories.add(f.category);
            });
        });

        return {
            plans,
            featureCategories: Array.from(featureCategories),
        };
    }

    //Generate unique slug
    private static async generateUniqueSlug(name: string, excludeUuid?: string): Promise<string> {
        let slug = slugify(name, { lower: true, strict: true });
        let counter = 1;

        while (true) {
            const existing = await prisma.plan.findFirst({
                where: {
                    slug,
                    uuid: excludeUuid ? { not: excludeUuid } : undefined,
                },
            });

            if (!existing) break;

            slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
            counter++;
        }

        return slug;
    }

    //Get plan analytics
    static async getPlanAnalytics(planUuid: string, dateFrom: Date, dateTo: Date) {
        const subscriptions = await prisma.subscription.count({
            where: {
                planUuid,
                createdAt: {
                    gte: dateFrom,
                    lte: dateTo,
                },
            },
        });

        const activeSubscriptions = await prisma.subscription.count({
            where: {
                planUuid,
                status: "ACTIVE",
            },
        });

        const revenue = await prisma.subscription.aggregate({
            where: {
                planUuid,
                status: "ACTIVE",
            },
            _sum: {
                currentPeriodAmount: true,
            },
        });

        const churnedSubscriptions = await prisma.subscription.count({
            where: {
                planUuid,
                status: "CANCELLED",
                cancelledAt: {
                    gte: dateFrom,
                    lte: dateTo,
                },
            },
        });

        const churnRate = activeSubscriptions > 0
            ? (churnedSubscriptions / (activeSubscriptions + churnedSubscriptions)) * 100
            : 0;

        return {
            totalSubscriptions: subscriptions,
            activeSubscriptions,
            monthlyRecurringRevenue: revenue._sum.currentPeriodAmount || 0,
            churnedSubscriptions,
            churnRate: Math.round(churnRate * 100) / 100,
        };
    }
}