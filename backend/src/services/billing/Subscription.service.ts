import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Subscriptions a tenant can move to another plan
const CHANGEABLE_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

// Plan limits checked against what the tenant already has
const LIMIT_KEYS = ["maxStores", "maxStaff", "maxProducts"] as const;
type PlanLimits = Partial<Record<(typeof LIMIT_KEYS)[number], number>>;

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
    //
    // One transaction, under a lock on the tenant's subscription row, so two
    // plan changes for a tenant run one after the other. The subscription is
    // changed in place (Subscription.tenantUuid is unique: there is one row
    // per tenant); the old cancel-then-create left the tenant with a
    // CANCELLED subscription whenever the create failed.
    //
    // Every change, upgrade or downgrade, must fit the tenant's current usage
    // under the target plan's limits. A cheaper price is not what makes a
    // downgrade: a pricier plan can still have lower limits.
    //
    // No proration or charge happens here; the new price applies from now.
    static async changePlan(input: {
        tenantUuid: string;
        newPlanUuid: string;
        newPlanVersionUuid?: string; // defaults to the plan's latest active version
        changedBy?: string;
    }) {
        if (!input.newPlanUuid) {
            throw new Error("PLAN_REQUIRED");
        }

        try {
            const { previous, updated, eventType } = await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "tenantUuid" = ${input.tenantUuid} FOR UPDATE`;

                const previous = await tx.subscription.findUnique({
                    where: { tenantUuid: input.tenantUuid },
                });
                if (!previous || !CHANGEABLE_STATUSES.has(previous.status)) {
                    throw new Error("NO_ACTIVE_SUBSCRIPTION");
                }

                const plan = await tx.plan.findFirst({
                    where: { uuid: input.newPlanUuid, isActive: true },
                    include: { quotas: { where: { enforced: true } } },
                });
                if (!plan) {
                    throw new Error("PLAN_NOT_FOUND");
                }

                // The version must belong to this plan: limits are read from it
                const version = input.newPlanVersionUuid
                    ? await tx.planVersion.findFirst({
                        where: { uuid: input.newPlanVersionUuid, planUuid: plan.uuid, isActive: true },
                    })
                    : await tx.planVersion.findFirst({
                        where: { planUuid: plan.uuid, isActive: true },
                        orderBy: { version: "desc" },
                    });
                if (!version) {
                    throw new Error("PLAN_VERSION_NOT_FOUND");
                }

                if (previous.planUuid === plan.uuid && previous.planVersionUuid === version.uuid) {
                    throw new Error("ALREADY_ON_PLAN");
                }

                // Same billing interval and currency as the current subscription
                const price = await tx.planPrice.findFirst({
                    where: {
                        planUuid: plan.uuid,
                        interval: previous.interval,
                        currency: previous.currency,
                        isActive: true,
                    },
                    orderBy: { isDefault: "desc" },
                });
                if (!price) {
                    throw new Error("PLAN_PRICE_NOT_FOUND");
                }

                const limits = this.planLimits(plan.quotas, version.quotas);
                const violations = await this.limitViolations(tx, input.tenantUuid, limits);
                if (violations.length > 0) {
                    throw new Error(`PLAN_LIMITS_EXCEEDED: ${violations.join("; ")}`);
                }

                const updated = await tx.subscription.update({
                    where: { uuid: previous.uuid },
                    data: {
                        planUuid: plan.uuid,
                        planVersionUuid: version.uuid,
                        planPriceUuid: price.uuid,
                        currentPeriodAmount: price.amount,
                        price: price.amount,
                        amount: price.amount,
                        intervalCount: price.intervalCount,
                    },
                });

                // enforceStoreLimit reads the tenant's own copy of the limit
                if (limits.maxStores !== undefined) {
                    await tx.tenant.update({
                        where: { uuid: input.tenantUuid },
                        data: { maxStores: limits.maxStores },
                    });
                }

                const eventType =
                    price.amount > previous.currentPeriodAmount ? "UPGRADED"
                    : price.amount < previous.currentPeriodAmount ? "DOWNGRADED"
                    : "PLAN_CHANGED";

                await tx.subscriptionHistory.create({
                    data: {
                        subscriptionUuid: previous.uuid,
                        eventType,
                        oldPlanUuid: previous.planUuid,
                        newPlanUuid: plan.uuid,
                        oldPriceUuid: previous.planPriceUuid,
                        newPriceUuid: price.uuid,
                        oldAmount: previous.currentPeriodAmount,
                        newAmount: price.amount,
                        performedBy: input.changedBy,
                        reason: "PLAN_CHANGE",
                        metadata: {
                            oldPlanVersionUuid: previous.planVersionUuid,
                            newPlanVersionUuid: version.uuid,
                            limits,
                        },
                    },
                });

                return { previous, updated, eventType };
            });

            logWithContext("info", "[Subscription] Plan changed", {
                tenantUuid: input.tenantUuid,
                oldPlanUuid: previous.planUuid,
                newPlanUuid: updated.planUuid,
                eventType,
            });

            // After the commit, so a rolled-back change is never announced
            EventBus.emit("SUBSCRIPTION_PLAN_CHANGED", {
                tenantUuid: input.tenantUuid,
                subscriptionUuid: updated.uuid,
                oldPlanUuid: previous.planUuid,
                newPlanUuid: updated.planUuid,
                eventType,
            });

            return updated;
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

    // A plan's hard limits: its enforced PlanQuota rows, falling back to the
    // plan version's quotas JSON for keys the plan has no row for
    private static planLimits(
        quotas: Array<{ quotaKey: string; limit: number; limitType: string }>,
        versionQuotas: unknown
    ): PlanLimits {
        const limits: PlanLimits = {};
        const fromVersion = (versionQuotas ?? {}) as Record<string, unknown>;

        for (const key of LIMIT_KEYS) {
            const row = quotas.find((q) => q.quotaKey === key && q.limitType === "HARD");
            const value = row ? row.limit : fromVersion[key];
            if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
                limits[key] = value;
            }
        }

        return limits;
    }

    // What the tenant uses now that the limits wouldn't allow
    private static async limitViolations(tx: any, tenantUuid: string, limits: PlanLimits) {
        const violations: string[] = [];

        if (limits.maxStores !== undefined) {
            const stores = await tx.store.count({
                where: { tenantUuid, active: true, deletedAt: null },
            });
            if (stores > limits.maxStores) {
                violations.push(`${stores} active stores, plan allows ${limits.maxStores}`);
            }
        }

        // Staff are people assigned to a store. TenantUser rows include
        // customers (whose default role is STAFF), so they can't be counted.
        if (limits.maxStaff !== undefined) {
            const staff = await tx.userStore.findMany({
                where: { tenantUuid, isActive: true },
                distinct: ["userUuid"],
                select: { userUuid: true },
            });
            if (staff.length > limits.maxStaff) {
                violations.push(`${staff.length} staff, plan allows ${limits.maxStaff}`);
            }
        }

        if (limits.maxProducts !== undefined) {
            const products = await tx.product.count({
                where: { tenantUuid, isDeleted: false },
            });
            if (products > limits.maxProducts) {
                violations.push(`${products} products, plan allows ${limits.maxProducts}`);
            }
        }

        return violations;
    }
}