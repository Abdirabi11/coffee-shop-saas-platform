import crypto from "node:crypto";
import dayjs from "dayjs";
import { Prisma, type BillingInterval } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ACTIVE_SUBSCRIPTION_STATUSES, PlanLimitService } from "./PlanLimit.service.ts";
import { QuotaService } from "./Quota.service.ts";

type Tx = Prisma.TransactionClient;

export class SubscriptionService{
    //Create subscription
    //
    // There is one Subscription row per tenant (tenantUuid is unique), so a
    // tenant whose subscription ended gets that row restarted on the new plan
    // rather than a second one. Everything (subscription, quotas, the
    // tenant's store limit, history) is written in one transaction.
    static async createSubscription(input: {
        tenantUuid: string;
        planUuid: string;
        planVersionUuid?: string; // defaults to the plan's latest active version
        interval: BillingInterval;
        startTrial?: boolean;
        createdBy?: string;
    }) {
        try {
            const subscription = await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "tenantUuid" = ${input.tenantUuid} FOR UPDATE`;

                const existing = await tx.subscription.findUnique({
                    where: { tenantUuid: input.tenantUuid },
                });
                if (existing && ACTIVE_SUBSCRIPTION_STATUSES.has(existing.status)) {
                    throw new Error("SUBSCRIPTION_EXISTS");
                }

                const { plan, version, price } = await this.resolvePlan(tx, {
                    planUuid: input.planUuid,
                    planVersionUuid: input.planVersionUuid,
                    interval: input.interval,
                });

                // A tenant coming back may already have more than this plan allows
                const limits = PlanLimitService.limitsFor(plan.quotas, version.quotas);
                const violations = await PlanLimitService.violations(tx, input.tenantUuid, limits);
                if (violations.length > 0) {
                    throw new Error(`PLAN_LIMITS_EXCEEDED: ${violations.join("; ")}`);
                }

                // One trial per tenant: none for a tenant that already had a subscription
                const now = new Date();
                const trial = !!input.startTrial && plan.trialEnabled && !existing;
                const trialEnd = trial ? dayjs(now).add(plan.trialDays, "day").toDate() : null;
                const currentPeriodEnd = trialEnd ?? this.calculatePeriodEnd(now, price.interval, price.intervalCount);

                const terms = {
                    planUuid: plan.uuid,
                    planVersionUuid: version.uuid,
                    planPriceUuid: price.uuid,
                    status: trial ? ("TRIALING" as const) : ("ACTIVE" as const),
                    interval: price.interval,
                    intervalCount: price.intervalCount,
                    currentPeriodStart: now,
                    currentPeriodEnd,
                    currentPeriodAmount: price.amount,
                    price: price.amount,
                    amount: price.amount,
                    currency: price.currency,
                    trialStart: trial ? now : null,
                    trialEnd,
                    isInTrial: trial,
                    cancelAtPeriodEnd: false,
                    cancelledAt: null,
                    cancelledBy: null,
                    cancellationReason: null,
                    startDate: now,
                    endDate: null,
                };

                const subscription = existing
                    ? await tx.subscription.update({ where: { uuid: existing.uuid }, data: terms })
                    : await tx.subscription.create({
                        data: {
                            ...terms,
                            tenantUuid: input.tenantUuid,
                            subscriptionNumber: this.newSubscriptionNumber(now),
                            taxExempt: false,
                        },
                    });

                await QuotaService.initializeQuotas(input.tenantUuid, plan.uuid, tx);

                // enforceStoreLimit and the tenant dashboard read the tenant's own copy
                if (limits.maxStores !== undefined) {
                    await tx.tenant.update({
                        where: { uuid: input.tenantUuid },
                        data: { maxStores: limits.maxStores },
                    });
                }

                await tx.subscriptionHistory.create({
                    data: {
                        subscriptionUuid: subscription.uuid,
                        eventType: trial ? "TRIAL_STARTED" : existing ? "ACTIVATED" : "CREATED",
                        oldPlanUuid: existing?.planUuid,
                        newPlanUuid: plan.uuid,
                        oldPriceUuid: existing?.planPriceUuid,
                        newPriceUuid: price.uuid,
                        oldAmount: existing?.currentPeriodAmount,
                        newAmount: price.amount,
                        performedBy: input.createdBy,
                        reason: existing ? "RESUBSCRIBED" : "CREATED",
                        metadata: { planVersionUuid: version.uuid, limits },
                    },
                });

                return subscription;
            });

            logWithContext("info", "[Subscription] Created", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
                planUuid: subscription.planUuid,
            });

            // After the commit, so a rolled-back create is never announced
            EventBus.emit("SUBSCRIPTION_CREATED", {
                subscriptionUuid: subscription.uuid,
                tenantUuid: input.tenantUuid,
                planUuid: subscription.planUuid,
            });

            return subscription;

        } catch (error:any) {
            logWithContext("error", "[Subscription] Failed to create", {
                error: error.message,
            });
            // Two first-time creates at once: the loser hits the unique tenantUuid
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new Error("SUBSCRIPTION_EXISTS");
            }
            throw error;
        }
    }

    // An active plan, its version (which must belong to it; default: latest
    // active) and its active price for the interval, with the plan's
    // enforced quotas
    private static async resolvePlan(tx: Tx, input: {
        planUuid: string;
        planVersionUuid?: string;
        interval: BillingInterval;
        currency?: string;
    }) {
        if (!input.planUuid) {
            throw new Error("PLAN_REQUIRED");
        }

        const plan = await tx.plan.findFirst({
            where: { uuid: input.planUuid, isActive: true },
            include: { quotas: { where: { enforced: true } } },
        });
        if (!plan) {
            throw new Error("PLAN_NOT_FOUND");
        }

        const version = input.planVersionUuid
            ? await tx.planVersion.findFirst({
                where: { uuid: input.planVersionUuid, planUuid: plan.uuid, isActive: true },
            })
            : await tx.planVersion.findFirst({
                where: { planUuid: plan.uuid, isActive: true },
                orderBy: { version: "desc" },
            });
        if (!version) {
            throw new Error("PLAN_VERSION_NOT_FOUND");
        }

        const price = await tx.planPrice.findFirst({
            where: {
                planUuid: plan.uuid,
                interval: input.interval,
                isActive: true,
                ...(input.currency && { currency: input.currency }),
            },
            orderBy: { isDefault: "desc" },
        });
        if (!price) {
            throw new Error("PLAN_PRICE_NOT_FOUND");
        }

        return { plan, version, price };
    }

    private static newSubscriptionNumber(now: Date) {
        return `SUB-${dayjs(now).format("YYYYMMDD")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
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
                if (!previous || !ACTIVE_SUBSCRIPTION_STATUSES.has(previous.status)) {
                    throw new Error("NO_ACTIVE_SUBSCRIPTION");
                }

                const { plan, version, price } = await this.resolvePlan(tx, {
                    planUuid: input.newPlanUuid,
                    planVersionUuid: input.newPlanVersionUuid,
                    // Same billing interval and currency as the current subscription
                    interval: previous.interval,
                    currency: previous.currency,
                });

                if (previous.planUuid === plan.uuid && previous.planVersionUuid === version.uuid) {
                    throw new Error("ALREADY_ON_PLAN");
                }

                const limits = PlanLimitService.limitsFor(plan.quotas, version.quotas);
                const violations = await PlanLimitService.violations(tx, input.tenantUuid, limits);
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
                subscription.interval,
                subscription.intervalCount
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
    private static calculatePeriodEnd(start: Date, interval: BillingInterval, intervalCount = 1): Date {
        const count = Math.max(1, intervalCount);
        switch (interval) {
            case "DAILY":
                return dayjs(start).add(count, "day").toDate();
            case "WEEKLY":
                return dayjs(start).add(count, "week").toDate();
            case "MONTHLY":
                return dayjs(start).add(count, "month").toDate();
            case "QUARTERLY":
                return dayjs(start).add(3 * count, "month").toDate();
            case "YEARLY":
                return dayjs(start).add(count, "year").toDate();
            case "BIENNIAL":
                return dayjs(start).add(2 * count, "year").toDate();
            default:
                // CUSTOM / ONE_TIME have no recurring period
                throw new Error(`UNSUPPORTED_INTERVAL: ${interval}`);
        }
    }
}
