import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class SubscriptionService{
    //Create subscription
    static async createSubscription(input: {
        tenantUuid: string;
        planUuid: string;
        planVersionUuid: string;
        interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
        startTrial?: boolean;
    }) {
        try {
            const plan = await prisma.plan.findUnique({
                where: { uuid: input.planUuid },
                include: {
                    prices: {
                        where: {
                            interval: input.interval,
                            isActive: true,
                        },
                        take: 1,
                    },
                },
            });
        
            if (!plan) {
                throw new Error("PLAN_NOT_FOUND");
            };
        
            const price = plan.prices[0];
            if (!price) {
                throw new Error("PLAN_PRICE_NOT_FOUND");
            }
        
            // Calculate dates
            const now = new Date();
            let currentPeriodStart = now;
            let currentPeriodEnd: Date;
            let trialEnd: Date | null = null;
            let status: "TRIALING" | "ACTIVE" = "ACTIVE";
        
            if (input.startTrial && plan.trialEnabled) {
                trialEnd = dayjs(now).add(plan.trialDays, "day").toDate();
                currentPeriodEnd = trialEnd;
                status = "TRIALING";
            } else {
                currentPeriodEnd = this.calculatePeriodEnd(now, input.interval);
            };
        
            // Create subscription
            const subscription = await prisma.subscription.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    planUuid: input.planUuid,
                    planVersionUuid: input.planVersionUuid,
                    status,
                    interval: input.interval,
                    currentPeriodStart,
                    currentPeriodEnd,
                    currentPeriodAmount: price.amount,
                    trialEnd,
                    cancelAtPeriodEnd: false,
                },
            });

            // Initialize quota usage
            await QuotaService.initializeQuotas(input.tenantUuid, input.planUuid);

            logWithContext("info", "[Subscription] Created", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
                planUuid: input.planUuid,
            });

            EventBus.emit("SUBSCRIPTION_CREATED", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
                planUuid: input.planUuid,
            });

            return subscription;

        } catch (error:any) {
            logWithContext("error", "[Subscription] Failed to create", {
                error: error.message,
            });
            throw error;
        }
    }

    //Get tenant subscription
    static async getTenantSubscription(tenantUuid: string) {
        const subscription = await prisma.subscription.findFirst({
            where: {
                tenantUuid,
                status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
            },
            include: {
                plan: {
                    include: {
                        features: true,
                        quotas: true,
                    },
                },
                planVersion: true,
            },
            orderBy: { createdAt: "desc" },
        });
      
        return subscription;
    }

    //Change plan (upgrade/downgrade)
    static async changePlan(input: {
        tenantUuid: string;
        newPlanUuid: string;
        newPlanVersionUuid: string;
        prorated?: boolean;
    }) {
        try {
            const currentSub = await this.getTenantSubscription(input.tenantUuid);

            if (!currentSub) {
                throw new Error("NO_ACTIVE_SUBSCRIPTION");
            };

            const newPlan = await prisma.plan.findUnique({
                where: { uuid: input.newPlanUuid },
                include: {
                    prices: {
                        where: {
                        interval: currentSub.interval,
                        isActive: true,
                        },
                        take: 1,
                    },
                },
            });
        
            if (!newPlan) {
                throw new Error("PLAN_NOT_FOUND");
            };
        
            const newPrice = newPlan.prices[0];
            if (!newPrice) {
                throw new Error("PLAN_PRICE_NOT_FOUND");
            };

            // Validate downgrade if applicable
            if (newPrice.amount < currentSub.currentPeriodAmount) {
                const validation = await this.validateDowngrade(
                    input.tenantUuid,
                    input.newPlanVersionUuid
                );

                if (!validation.allowed) {
                    throw new Error(`DOWNGRADE_NOT_ALLOWED: ${validation.violations.join(", ")}`);
                }
            };

             // Cancel current subscription
            await prisma.subscription.update({
                where: { uuid: currentSub.uuid },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancellationReason: "PLAN_CHANGE",
                },
            });

            // Create new subscription
            const newSubscription = await this.createSubscription({
                tenantUuid: input.tenantUuid,
                planUuid: input.newPlanUuid,
                planVersionUuid: input.newPlanVersionUuid,
                interval: currentSub.interval,
                startTrial: false,
            });

            logWithContext("info", "[Subscription] Plan changed", {
                tenantUuid: input.tenantUuid,
                oldPlanUuid: currentSub.planUuid,
                newPlanUuid: input.newPlanUuid,
            });
        
            EventBus.emit("SUBSCRIPTION_PLAN_CHANGED", {
                tenantUuid: input.tenantUuid,
                oldSubscriptionUuid: currentSub.uuid,
                newSubscriptionUuid: newSubscription.uuid,
            });
        
            return newSubscription;
        } catch (error: any) {
            logWithContext("error", "[Subscription] Failed to change plan", {
                error: error.message,
            });
            throw error;
        }
    }

    //Cancel subscription
    static async cancelSubscription(input: {
        tenantUuid: string;
        immediately?: boolean;
        reason?: string;
        cancelledBy: string;
    }) {
        try {
            const subscription = await this.getTenantSubscription(input.tenantUuid);

            if (!subscription) {
                throw new Error("NO_ACTIVE_SUBSCRIPTION");
            }
      
            const updates: any = {
                cancelledAt: new Date(),
                cancelledBy: input.cancelledBy,
                cancellationReason: input.reason,
            };
      
            if (input.immediately) {
                updates.status = "CANCELLED";
            } else {
                updates.cancelAtPeriodEnd = true;
            };

            await prisma.subscription.update({
                where: { uuid: subscription.uuid },
                data: updates,
            });
        
            logWithContext("info", "[Subscription] Cancelled", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
                immediately: input.immediately,
            });
        
            EventBus.emit("SUBSCRIPTION_CANCELLED", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
            });
        } catch (error: any) {
            logWithContext("error", "[Subscription] Failed to cancel", {
                error: error.message,
            });
            throw error;
        }
    }

    //Reactivate subscription
    static async reactivateSubscription(tenantUuid: string) {
        const subscription = await prisma.subscription.findFirst({
            where: {
                tenantUuid,
                cancelAtPeriodEnd: true,
            },
        });

        if (!subscription) {
            throw new Error("NO_CANCELLABLE_SUBSCRIPTION");
        };
      
        await prisma.subscription.update({
            where: { uuid: subscription.uuid },
            data: {
                cancelAtPeriodEnd: false,
                cancelledAt: null,
                cancelledBy: null,
                cancellationReason: null,
            },
        });
      
        logWithContext("info", "[Subscription] Reactivated", {
            subscriptionUuid: subscription.uuid,
            tenantUuid,
        });
      
        EventBus.emit("SUBSCRIPTION_REACTIVATED", {
            subscriptionUuid: subscription.uuid,
            tenantUuid,
        });
    }

    //Renew subscription
    static async renewSubscription(subscriptionUuid: string) {
        try {
            const subscription = await prisma.subscription.findUnique({
                where: { uuid: subscriptionUuid },
            });
        
            if (!subscription) {
                throw new Error("SUBSCRIPTION_NOT_FOUND");
            }
        
            // Calculate new period
            const newPeriodStart = subscription.currentPeriodEnd;
            const newPeriodEnd = this.calculatePeriodEnd(
                newPeriodStart,
                subscription.interval
            );

            await prisma.subscription.update({
                where: { uuid: subscriptionUuid },
                data: {
                    currentPeriodStart: newPeriodStart,
                    currentPeriodEnd: newPeriodEnd,
                    status: "ACTIVE",
                },
            });
        
            logWithContext("info", "[Subscription] Renewed", {
                subscriptionUuid,
            });
        
            EventBus.emit("SUBSCRIPTION_RENEWED", {
                subscriptionUuid,
                tenantUuid: subscription.tenantUuid,
            });
        
        } catch (error: any) {
            logWithContext("error", "[Subscription] Failed to renew", {
                error: error.message,
            });
            throw error;
        }
    }

    //Calculate period end date
    private static calculatePeriodEnd(
        start: Date,
        interval: "MONTHLY" | "QUARTERLY" | "YEARLY"
    ): Date {
        switch (interval) {
            case "MONTHLY":
                return dayjs(start).add(1, "month").toDate();
            case "QUARTERLY":
                return dayjs(start).add(3, "month").toDate();
            case "YEARLY":
                return dayjs(start).add(1, "year").toDate();
        }
    }

    //Validate downgrade
    private static async validateDowngrade(
        tenantUuid: string,
        targetPlanVersionUuid: string
    ) {
        const targetPlanVersion = await prisma.planVersion.findUnique({
            where: { uuid: targetPlanVersionUuid },
        });

        if (!targetPlanVersion) {
            throw new Error("PLAN_VERSION_NOT_FOUND");
        }

        const quotas = targetPlanVersion.quotas as any;
        const violations: string[] = [];

        // Check store count
        if (quotas?.maxStores) {
            const storeCount = await prisma.store.count({
                where: { tenantUuid },
            });

            if (storeCount > quotas.maxStores) {
                violations.push(
                `You have ${storeCount} stores but plan allows ${quotas.maxStores}`
                );
            }
        };

        // Check staff count
        if (quotas?.maxStaff) {
            const staffCount = await prisma.tenantUser.count({
                where: { tenantUuid, isActive: true },
            });

            if (staffCount > quotas.maxStaff) {
                violations.push(
                    `You have ${staffCount} staff but plan allows ${quotas.maxStaff}`
                );
            }
        };

        // Check product count
        if (quotas?.maxProducts) {
            const productCount = await prisma.product.count({
                where: { tenantUuid },
            });

            if (productCount > quotas.maxProducts) {
                violations.push(
                `You have ${productCount} products but plan allows ${quotas.maxProducts}`
                );
            }
        };

        return {
            allowed: violations.length === 0,
            violations,
        };
    }
}