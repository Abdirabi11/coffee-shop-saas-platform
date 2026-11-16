import { Prisma } from "@prisma/client";
import type { FlagScope, RolloutType, SettingValueType } from "@prisma/client";
import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class PlatformSettingsError extends Error {
    constructor(public code: string, public status: number, message?: string) {
        super(message ?? code);
    }
}

export const MAINTENANCE_KEY = "MAINTENANCE_MODE";
export const FINANCE_KEY = "FINANCE";

export type MaintenanceState = { enabled: boolean; message: string | null };

// The guard reads the maintenance state on every request: keep it in memory
// for a few seconds instead of hitting the database each time. A toggle on
// this instance applies at once; other instances pick it up within the TTL.
const MAINTENANCE_TTL_MS = 5_000;
let maintenanceCache: { state: MaintenanceState; expiresAt: number } | null = null;

function toMaintenance(value: Prisma.JsonValue | undefined): MaintenanceState {
    const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
    return {
        enabled: v.enabled === true,
        message: typeof v.message === "string" ? v.message : null,
    };
}

export class PlatformSettingsService {
    // ─── Platform settings (scope PLATFORM, no tenant) ──────────────────
    // PlatformSetting is unique on (scope, tenantUuid, key), but Postgres
    // treats NULL tenantUuids as distinct, so platform rows are found with
    // findFirst rather than upsert. Every change is kept in SettingHistory.
    private static async writePlatformSetting(input: {
        key: string;
        name: string;
        category: string;
        valueType: SettingValueType;
        value: Prisma.InputJsonValue;
        updatedBy: string;
        reason?: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.platformSetting.findFirst({
                where: { scope: "PLATFORM", tenantUuid: null, key: input.key },
            });

            if (!existing) {
                const created = await tx.platformSetting.create({
                    data: {
                        scope: "PLATFORM",
                        key: input.key,
                        name: input.name,
                        category: input.category,
                        valueType: input.valueType,
                        value: input.value,
                        updatedBy: input.updatedBy,
                        updatedReason: input.reason,
                    },
                });
                await tx.settingHistory.create({
                    data: {
                        settingUuid: created.uuid,
                        previousValue: Prisma.JsonNull,
                        newValue: input.value,
                        changedBy: input.updatedBy,
                        changeReason: input.reason,
                    },
                });
                return created;
            }

            const updated = await tx.platformSetting.update({
                where: { uuid: existing.uuid },
                data: {
                    value: input.value,
                    previousValue: existing.value ?? Prisma.JsonNull,
                    version: { increment: 1 },
                    updatedBy: input.updatedBy,
                    updatedReason: input.reason,
                },
            });
            await tx.settingHistory.create({
                data: {
                    settingUuid: existing.uuid,
                    previousValue: existing.value ?? Prisma.JsonNull,
                    newValue: input.value,
                    changedBy: input.updatedBy,
                    changeReason: input.reason,
                },
            });
            return updated;
        });
    }

    // ─── Maintenance mode ───────────────────────────────────────────────
    static async getMaintenance(): Promise<MaintenanceState> {
        if (maintenanceCache && maintenanceCache.expiresAt > Date.now()) return maintenanceCache.state;
        const setting = await prisma.platformSetting.findFirst({
            where: { scope: "PLATFORM", tenantUuid: null, key: MAINTENANCE_KEY },
            select: { value: true },
        });
        const state = toMaintenance(setting?.value);
        maintenanceCache = { state, expiresAt: Date.now() + MAINTENANCE_TTL_MS };
        return state;
    }

    static async setMaintenance(input: { enabled: boolean; message?: string | null; updatedBy: string; reason?: string }) {
        const state: MaintenanceState = { enabled: input.enabled, message: input.message ?? null };
        await this.writePlatformSetting({
            key: MAINTENANCE_KEY,
            name: "Maintenance mode",
            category: "OPERATIONS",
            valueType: "JSON",
            value: state,
            updatedBy: input.updatedBy,
            reason: input.reason,
        });
        maintenanceCache = { state, expiresAt: Date.now() + MAINTENANCE_TTL_MS };

        logWithContext("warn", "[PlatformSettings] Maintenance mode changed", {
            enabled: state.enabled,
            updatedBy: input.updatedBy,
        });
        return state;
    }

    // ─── Finance defaults ───────────────────────────────────────────────
    static async setFinance(input: { taxRate: number; currency: string; updatedBy: string; reason?: string }) {
        const value = { taxRate: input.taxRate, currency: input.currency };
        await this.writePlatformSetting({
            key: FINANCE_KEY,
            name: "Platform finance defaults",
            category: "FINANCE",
            valueType: "JSON",
            value,
            updatedBy: input.updatedBy,
            reason: input.reason,
        });
        logWithContext("info", "[PlatformSettings] Finance defaults changed", { ...value, updatedBy: input.updatedBy });
        return value;
    }

    // ─── Feature flags ──────────────────────────────────────────────────
    static async listFeatureFlags(filter: { scope?: FlagScope; tenantUuid?: string }) {
        return prisma.featureFlag.findMany({
            where: {
                ...(filter.scope && { scope: filter.scope }),
                ...(filter.tenantUuid && { tenantUuid: filter.tenantUuid }),
            },
            orderBy: [{ key: "asc" }, { scope: "asc" }],
        });
    }

    // Creates or updates the flag identified by (key, scope, tenantUuid):
    // a GLOBAL flag has no tenant; a TENANT flag is that tenant's override
    // of the global one (see FeatureFlagService.isEnabled).
    static async upsertFeatureFlag(input: {
        key: string;
        scope: "GLOBAL" | "TENANT";
        tenantUuid?: string;
        name?: string;
        description?: string | null;
        category?: string | null;
        enabled: boolean;
        rolloutType?: RolloutType;
        rolloutPercentage?: number | null;
        enabledFrom?: Date | null;
        enabledUntil?: Date | null;
        updatedBy: string;
    }) {
        const tenantUuid = input.scope === "TENANT" ? input.tenantUuid! : null;
        if (tenantUuid) {
            const tenant = await prisma.tenant.findUnique({ where: { uuid: tenantUuid }, select: { uuid: true } });
            if (!tenant) throw new PlatformSettingsError("TENANT_NOT_FOUND", 404);
        }

        const fields = {
            enabled: input.enabled,
            ...(input.description !== undefined && { description: input.description }),
            ...(input.category !== undefined && { category: input.category }),
            ...(input.rolloutType !== undefined && { rolloutType: input.rolloutType }),
            ...(input.rolloutPercentage !== undefined && { rolloutPercentage: input.rolloutPercentage }),
            ...(input.enabledFrom !== undefined && { enabledFrom: input.enabledFrom }),
            ...(input.enabledUntil !== undefined && { enabledUntil: input.enabledUntil }),
            updatedBy: input.updatedBy,
        };

        const { flag, created } = await prisma.$transaction(async (tx) => {
            const existing = await tx.featureFlag.findFirst({
                where: { key: input.key, scope: input.scope, tenantUuid },
                select: { uuid: true },
            });
            if (existing) {
                const flag = await tx.featureFlag.update({
                    where: { uuid: existing.uuid },
                    data: { ...fields, ...(input.name !== undefined && { name: input.name }) },
                });
                return { flag, created: false };
            }
            const flag = await tx.featureFlag.create({
                data: {
                    ...fields,
                    key: input.key,
                    scope: input.scope,
                    tenantUuid,
                    name: input.name ?? input.key,
                    createdBy: input.updatedBy,
                },
            });
            return { flag, created: true };
        });

        logWithContext("info", "[PlatformSettings] Feature flag saved", {
            key: flag.key,
            scope: flag.scope,
            tenantUuid: flag.tenantUuid,
            enabled: flag.enabled,
            created,
            updatedBy: input.updatedBy,
        });
        return { flag, created };
    }

    static async deleteFeatureFlag(flagUuid: string, deletedBy: string) {
        const flag = await prisma.featureFlag.findUnique({ where: { uuid: flagUuid }, select: { uuid: true, key: true, scope: true } });
        if (!flag) throw new PlatformSettingsError("FEATURE_FLAG_NOT_FOUND", 404);

        await prisma.$transaction([
            prisma.featureFlagEvaluation.deleteMany({ where: { flagUuid } }),
            prisma.featureFlagOverride.deleteMany({ where: { flagUuid } }),
            prisma.featureFlag.delete({ where: { uuid: flagUuid } }),
        ]);

        logWithContext("info", "[PlatformSettings] Feature flag deleted", { ...flag, deletedBy });
        return { deleted: true };
    }

    // ─── Email templates (system defaults: no tenant, no store) ─────────
    static async listEmailTemplates() {
        return prisma.emailTemplate.findMany({
            where: { tenantUuid: null, storeUuid: null },
            orderBy: [{ key: "asc" }, { locale: "asc" }],
        });
    }

    static async updateEmailTemplate(input: {
        key: string;
        locale: string;
        subject?: string;
        bodyHtml?: string;
        bodyText?: string | null;
        isActive?: boolean;
        updatedBy: string;
    }) {
        const template = await prisma.emailTemplate.findFirst({
            where: { tenantUuid: null, storeUuid: null, key: input.key, locale: input.locale },
            select: { uuid: true },
        });
        if (!template) throw new PlatformSettingsError("EMAIL_TEMPLATE_NOT_FOUND", 404);

        return prisma.emailTemplate.update({
            where: { uuid: template.uuid },
            data: {
                ...(input.subject !== undefined && { subject: input.subject }),
                ...(input.bodyHtml !== undefined && { bodyHtml: input.bodyHtml }),
                ...(input.bodyText !== undefined && { bodyText: input.bodyText }),
                ...(input.isActive !== undefined && { isActive: input.isActive }),
                version: { increment: 1 },
                lastModifiedBy: input.updatedBy,
            },
        });
    }

    // ─── Platform branding ──────────────────────────────────────────────
    static async getBranding() {
        return prisma.brandingSetting.findFirst({
            where: { scope: "PLATFORM", tenantUuid: null, storeUuid: null },
        });
    }

    static async updateBranding(input: Record<string, unknown> & { updatedBy: string }) {
        const { updatedBy, ...fields } = input;
        const existing = await this.getBranding();
        if (existing) {
            return prisma.brandingSetting.update({
                where: { uuid: existing.uuid },
                data: { ...(fields as Prisma.BrandingSettingUpdateInput), updatedBy },
            });
        }
        if (typeof fields.appName !== "string") {
            throw new PlatformSettingsError("VALIDATION_ERROR", 400, "appName is required for the first branding save");
        }
        return prisma.brandingSetting.create({
            data: {
                ...(fields as Omit<Prisma.BrandingSettingCreateInput, "appName">),
                appName: fields.appName,
                scope: "PLATFORM",
                isDefault: true,
                createdBy: updatedBy,
                updatedBy,
            },
        });
    }
}
