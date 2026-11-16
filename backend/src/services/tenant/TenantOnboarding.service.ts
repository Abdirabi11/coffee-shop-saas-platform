import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { PlanLimitService } from "../billing/PlanLimit.service.ts";
import { StoreDashboardService } from "../Dashboards/StoreDashboard.service.ts";
import { MenuCacheService } from "../menu/menuCache.service.ts";
import { slugify } from "../../utils/slugify.ts";

// Errors carry a code first ("INVALID_TIMEZONE: ..."); the controller maps
// them to 4xx answers
export class OnboardingError extends Error {
    constructor(public code: string, public status: number, message?: string) {
        super(message ? `${code}: ${message}` : code);
    }
}

// An IANA zone name the runtime knows ("Africa/Mogadishu", "UTC")
export function isValidTimezone(tz: unknown): tz is string {
    if (typeof tz !== "string" || !tz.trim()) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, field: string, opts: { required?: boolean; max: number }): string | undefined {
    if (value === undefined || value === null || value === "") {
        if (opts.required) throw new OnboardingError("VALIDATION_ERROR", 400, `${field} is required`);
        return undefined;
    }
    if (typeof value !== "string" || !value.trim()) throw new OnboardingError("VALIDATION_ERROR", 400, `${field} must be a string`);
    const trimmed = value.trim();
    if (trimmed.length > opts.max) throw new OnboardingError("VALIDATION_ERROR", 400, `${field} is longer than ${opts.max} characters`);
    return trimmed;
}

function email(value: unknown, field: string): string | undefined {
    const v = text(value, field, { max: 254 });
    if (v !== undefined && !EMAIL.test(v)) throw new OnboardingError("VALIDATION_ERROR", 400, `${field} is not an email address`);
    return v?.toLowerCase();
}

function coordinate(value: unknown, field: string, limit: number): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > limit) throw new OnboardingError("VALIDATION_ERROR", 400, `${field} must be between -${limit} and ${limit}`);
    return n;
}

const isUniqueViolation = (error: unknown, field?: string) =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (!field || JSON.stringify(error.meta?.target ?? "").includes(field));

// Store fields a tenant admin may set at creation and change later. Not
// here on purpose: slug (kept stable for URLs), currency and tax rates
// (they change prices; need their own flow), status/active (deactivation
// goes through StoreStatusService).
export interface StoreProfileInput {
    name?: unknown;
    description?: unknown;
    city?: unknown;
    address?: unknown;
    timezone?: unknown;
    phone?: unknown;
    email?: unknown;
    latitude?: unknown;
    longitude?: unknown;
}

function storeProfile(input: StoreProfileInput, creating: boolean) {
    const timezone = input.timezone === undefined ? undefined : input.timezone;
    if (timezone !== undefined && !isValidTimezone(timezone)) {
        throw new OnboardingError("INVALID_TIMEZONE", 400, "timezone must be an IANA zone name such as Africa/Mogadishu");
    }
    return {
        name: text(input.name, "name", { required: creating, max: 120 }),
        description: text(input.description, "description", { max: 1000 }),
        city: text(input.city, "city", { required: creating, max: 120 }),
        address: text(input.address, "address", { max: 300 }),
        timezone: timezone as string | undefined,
        phone: text(input.phone, "phone", { max: 40 }),
        email: email(input.email, "email"),
        latitude: coordinate(input.latitude, "latitude", 90),
        longitude: coordinate(input.longitude, "longitude", 180),
    };
}

export class TenantOnboardingService {
    // A new tenant owned by the caller, with the caller as its TENANT_ADMIN.
    // One tenant per owner (Tenant.ownerUuid is unique). The tenant can't
    // add stores until it subscribes (POST /api/subscriptions).
    static async createTenant(input: {
        userUuid: string;
        name: unknown;
        email?: unknown;
        phone?: unknown;
        businessName?: unknown;
        industry?: unknown;
    }) {
        const name = text(input.name, "name", { required: true, max: 120 })!;
        const user = await prisma.user.findUnique({
            where: { uuid: input.userUuid },
            select: { uuid: true, email: true, firstName: true, lastName: true, isBanned: true },
        });
        if (!user || user.isBanned) throw new OnboardingError("USER_NOT_FOUND", 404);

        const contactEmail = email(input.email, "email") ?? user.email?.toLowerCase();
        if (!contactEmail) throw new OnboardingError("VALIDATION_ERROR", 400, "email is required (your account has none)");

        const data = {
            name,
            email: contactEmail,
            phone: text(input.phone, "phone", { max: 40 }),
            businessName: text(input.businessName, "businessName", { max: 200 }),
            industry: text(input.industry, "industry", { max: 80 }),
        };

        const base = slugify(name) || "shop";
        // Slugs are global: retry with a suffix on a clash
        for (let attempt = 0; attempt < 5; attempt++) {
            const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(3).toString("hex")}`;
            try {
                const result = await prisma.$transaction(async (tx) => {
                    const tenant = await tx.tenant.create({
                        data: { ...data, slug, ownerUuid: user.uuid, status: "ACTIVE" },
                    });
                    const tenantUser = await tx.tenantUser.create({
                        data: {
                            tenantUuid: tenant.uuid,
                            userUuid: user.uuid,
                            slug: `${slugify(`${user.firstName}-${user.lastName}`) || "owner"}-${crypto.randomBytes(3).toString("hex")}`,
                            role: "TENANT_ADMIN",
                            employmentType: "FULL_TIME",
                            displayName: `${user.firstName} ${user.lastName}`.trim(),
                            isActive: true,
                        },
                    });
                    return { tenant, tenantUser };
                });

                logWithContext("info", "[Onboarding] Tenant created", {
                    tenantUuid: result.tenant.uuid,
                    ownerUuid: user.uuid,
                });
                return result;
            } catch (error) {
                if (isUniqueViolation(error, "ownerUuid")) throw new OnboardingError("TENANT_ALREADY_EXISTS", 409, "You already own a tenant");
                if (isUniqueViolation(error, "slug")) continue;
                throw error;
            }
        }
        throw new OnboardingError("SLUG_UNAVAILABLE", 409, "Try a different name");
    }

    // A store in the caller's tenant, within the plan's maxStores. It starts
    // with no opening hours, so it takes no orders until they're set
    // (PUT /api/store/:storeUuid/hours/bulk).
    static async createStore(input: { tenantUuid: string; createdBy: string } & StoreProfileInput) {
        const profile = storeProfile(input, true);
        const base = slugify(profile.name!) || "store";

        for (let attempt = 0; attempt < 5; attempt++) {
            const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
            try {
                const store = await prisma.$transaction(async (tx) => {
                    // Locks the subscription: concurrent creates can't both
                    // take the last slot. Throws NO_ACTIVE_SUBSCRIPTION /
                    // PLAN_LIMIT_REACHED.
                    await PlanLimitService.assertCanAdd(tx, input.tenantUuid, "maxStores");
                    return tx.store.create({
                        data: {
                            tenantUuid: input.tenantUuid,
                            slug,
                            name: profile.name!,
                            city: profile.city!,
                            description: profile.description,
                            address: profile.address,
                            timezone: profile.timezone ?? "UTC",
                            phone: profile.phone,
                            email: profile.email,
                            latitude: profile.latitude ?? undefined,
                            longitude: profile.longitude ?? undefined,
                        },
                    });
                });

                logWithContext("info", "[Onboarding] Store created", {
                    tenantUuid: input.tenantUuid,
                    storeUuid: store.uuid,
                    createdBy: input.createdBy,
                });
                return store;
            } catch (error) {
                if (isUniqueViolation(error, "slug")) continue;
                throw error;
            }
        }
        throw new OnboardingError("SLUG_UNAVAILABLE", 409, "Try a different name");
    }

    // Updates the store's profile. A timezone change re-keys everything
    // store-local (opening hours, menu time slots, daily metrics and
    // reconciliation from the next day on), so the store's cached
    // dashboards and menu are dropped.
    static async updateStore(input: { tenantUuid: string; storeUuid: string; updatedBy: string } & StoreProfileInput) {
        const profile = storeProfile(input, false);
        const changes = Object.fromEntries(
            Object.entries(profile).filter(([, value]) => value !== undefined)
        ) as Prisma.StoreUpdateInput;
        if (Object.keys(changes).length === 0) {
            throw new OnboardingError("VALIDATION_ERROR", 400, "No updatable fields given");
        }

        const before = await prisma.store.findFirst({
            where: { uuid: input.storeUuid, tenantUuid: input.tenantUuid, deletedAt: null },
            select: { timezone: true },
        });
        if (!before) throw new OnboardingError("STORE_NOT_FOUND", 404);

        const store = await prisma.store.update({
            where: { uuid: input.storeUuid },
            data: changes,
        });

        const timezoneChanged = profile.timezone !== undefined && profile.timezone !== before.timezone;
        await Promise.all([
            StoreDashboardService.invalidate(input.storeUuid),
            timezoneChanged || profile.name !== undefined
                ? MenuCacheService.invalidate({
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    reason: timezoneChanged ? "STORE_TIMEZONE_CHANGED" : "STORE_UPDATED",
                    triggeredBy: input.updatedBy,
                })
                : undefined,
        ]).catch((error: any) => {
            // Caches expire on their own; the update itself succeeded
            logWithContext("warn", "[Onboarding] Cache invalidation after store update failed", {
                storeUuid: input.storeUuid,
                error: error.message,
            });
        });

        logWithContext("info", "[Onboarding] Store updated", {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            fields: Object.keys(changes),
            ...(timezoneChanged && { timezoneFrom: before.timezone, timezoneTo: profile.timezone }),
            updatedBy: input.updatedBy,
        });
        return store;
    }
}
