import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { redis } from "../../lib/redis.ts";

export class FeatureService{
    //Check if tenant has feature
    static async hasFeature(input: {
        tenantUuid: string;
        featureKey: string;
    }): Promise<boolean> {
        try {
            // Check cache first
            const cacheKey = `feature:${input.tenantUuid}:${input.featureKey}`;
            const cached = await redis.get(cacheKey);

            if (cached !== null) {
                return cached === "1";
            };

            // Get tenant's subscription
            const subscription = await prisma.subscription.findFirst({
                where: {
                    tenantUuid: input.tenantUuid,
                    status: { in: ["ACTIVE", "TRIALING"] },
                },
                include: {
                    plan: {
                        include: {
                        features: {
                            where: {
                            featureKey: input.featureKey,
                            },
                        },
                        },
                    },
                },
            });

            if (!subscription) {
                await redis.setex(cacheKey, 300, "0");
                return false;
            };
        
            const feature = subscription.plan.features[0];
            const hasFeature = feature?.enabled || false;
        
            // Cache for 5 minutes
            await redis.setex(cacheKey, 300, hasFeature ? "1" : "0");
        
            return hasFeature;
        } catch (error: any) {
            logWithContext("error", "[Feature] Failed to check feature", {
                error: error.message,
            });
        
            // Fail open - allow on error
            return true;
        }
    }

    //Get feature value
    static async getFeatureValue(input: {
        tenantUuid: string;
        featureKey: string;
    }): Promise<{
        enabled: boolean;
        quantity?: number;
        textValue?: string;
    } | null> {
        try {
            const subscription = await prisma.subscription.findFirst({
                where: {
                  tenantUuid: input.tenantUuid,
                  status: { in: ["ACTIVE", "TRIALING"] },
                },
                include: {
                    plan: {
                        include: {
                            features: {
                                where: {
                                    featureKey: input.featureKey,
                                },
                            },
                        },
                    },
                },
            });
        
            if (!subscription) return null;
    
            const feature = subscription.plan.features[0];
            if (!feature) return null;

            return {
                enabled: feature.enabled || false,
                quantity: feature.quantity || undefined,
                textValue: feature.textValue || undefined,
            };
        
        } catch (error: any) {
            logWithContext("error", "[Feature] Failed to get feature value", {
                error: error.message,
            });
            return null;
        }
    }
    
    //Get all tenant features
    static async getTenantFeatures(tenantUuid: string) {
        const subscription = await prisma.subscription.findFirst({
            where: {
              tenantUuid,
              status: { in: ["ACTIVE", "TRIALING"] },
            },
            include: {
                plan: {
                    include: {
                        features: {
                            orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
                        },
                    },
                },
            },
        });
      
        if (!subscription) {
            return [];
        };
      
        return subscription.plan.features;
    }
    
    //Invalidate feature cache
   
    static async invalidateFeatureCache(tenantUuid: string, featureKey?: string) {
        if (featureKey) {
            const cacheKey = `feature:${tenantUuid}:${featureKey}`;
            await redis.del(cacheKey);
        } else {
            // Clear all feature keys for tenant
            const keys = await redis.keys(`feature:${tenantUuid}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        }
    }
}