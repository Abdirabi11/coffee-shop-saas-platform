import type { Prisma } from "@prisma/client";
import type { Response } from "express";

type Tx = Prisma.TransactionClient;

// Plan limits on what a tenant has, checked when something is added and when
// the plan changes
export const LIMIT_KEYS = ["maxStores", "maxStaff", "maxProducts"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type PlanLimits = Partial<Record<LimitKey, number>>;

// Subscriptions whose plan applies. A tenant with none of these has no plan,
// and can't add stores, staff or products.
export const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

const LIMIT_LABELS: Record<LimitKey, string> = {
    maxStores: "active stores",
    maxStaff: "staff",
    maxProducts: "products",
};

export class PlanLimitService {

    // A plan's hard limits: its enforced HARD PlanQuota rows, falling back to
    // the plan version's quotas JSON for keys the plan has no row for
    static limitsFor(
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

    // How much of a limit the tenant uses now.
    // Staff are people assigned to a store: TenantUser rows include customers
    // (whose default role is STAFF), so they can't be counted.
    static async usage(client: Tx, tenantUuid: string, key: LimitKey): Promise<number> {
        switch (key) {
            case "maxStores":
                return client.store.count({ where: { tenantUuid, active: true, deletedAt: null } });
            case "maxStaff": {
                const staff = await client.userStore.findMany({
                    where: { tenantUuid, isActive: true },
                    distinct: ["userUuid"],
                    select: { userUuid: true },
                });
                return staff.length;
            }
            case "maxProducts":
                return client.product.count({ where: { tenantUuid, isDeleted: false } });
        }
    }

    // What the tenant uses now that the limits wouldn't allow
    static async violations(client: Tx, tenantUuid: string, limits: PlanLimits): Promise<string[]> {
        const violations: string[] = [];

        for (const key of LIMIT_KEYS) {
            const limit = limits[key];
            if (limit === undefined) continue;
            const used = await this.usage(client, tenantUuid, key);
            if (used > limit) {
                violations.push(`${used} ${LIMIT_LABELS[key]}, plan allows ${limit}`);
            }
        }

        return violations;
    }

    // Locks the tenant's subscription row and returns its plan's limits.
    // Adding stores/staff/products and changing plan all take this lock, so
    // for one tenant they run one at a time: two adds can't both see room for
    // the last slot, and a downgrade can't slip past an add in progress.
    static async lockPlan(tx: Tx, tenantUuid: string): Promise<PlanLimits> {
        await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "tenantUuid" = ${tenantUuid} FOR UPDATE`;

        const subscription = await tx.subscription.findUnique({
            where: { tenantUuid },
            select: {
                status: true,
                plan: { select: { quotas: { where: { enforced: true } } } },
                planVersion: { select: { quotas: true } },
            },
        });
        if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
            throw new Error("NO_ACTIVE_SUBSCRIPTION");
        }

        return this.limitsFor(subscription.plan.quotas, subscription.planVersion.quotas);
    }

    // Throws PLAN_LIMIT_REACHED unless the tenant's plan has room for `count`
    // more (on top of `pending`, e.g. open staff invitations). Call inside the
    // transaction that does the add, before it.
    static async assertCanAdd(
        tx: Tx,
        tenantUuid: string,
        key: LimitKey,
        options: { count?: number; pending?: number } = {}
    ) {
        const limits = await this.lockPlan(tx, tenantUuid);
        const limit = limits[key];
        if (limit === undefined) return; // the plan doesn't limit this

        const used = await this.usage(tx, tenantUuid, key);
        const count = options.count ?? 1;
        const pending = options.pending ?? 0;
        if (used + pending + count > limit) {
            const pendingNote = pending > 0 ? ` (+${pending} pending)` : "";
            throw new Error(
                `PLAN_LIMIT_REACHED: ${used} ${LIMIT_LABELS[key]}${pendingNote}, plan allows ${limit}`
            );
        }
    }
}

// The HTTP answer for a plan-limit error, or null if it isn't one
export function planLimitErrorResponse(res: Response, error: any) {
    const message: string = error?.message ?? "";

    if (message === "NO_ACTIVE_SUBSCRIPTION") {
        return res.status(403).json({
            error: "NO_ACTIVE_SUBSCRIPTION",
            message: "The tenant has no active subscription",
        });
    }
    if (message.startsWith("PLAN_LIMIT_REACHED")) {
        return res.status(409).json({
            error: "PLAN_LIMIT_REACHED",
            message: message.replace(/^PLAN_LIMIT_REACHED: /, ""),
        });
    }
    return null;
}
