import { z } from "zod";

const reason = z.string().trim().min(3, "reason is required").max(500);

export const maintenanceSchema = z.object({
    enabled: z.boolean(),
    message: z.string().trim().max(500).nullish(),
    reason: z.string().trim().max(500).optional(),
});

export const financeSchema = z.object({
    taxRate: z.number().min(0).max(100),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code such as USD"),
    reason: z.string().trim().max(500).optional(),
});

const isoDate = z.coerce.date();

export const featureFlagSchema = z
    .object({
        key: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{1,99}$/i, "key: letters, digits, _ . - (2-100 chars)"),
        scope: z.enum(["GLOBAL", "TENANT"]).default("GLOBAL"),
        tenantUuid: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(1000).nullish(),
        category: z.string().trim().max(80).nullish(),
        enabled: z.boolean(),
        rolloutType: z.enum(["BOOLEAN", "PERCENTAGE"]).optional(),
        rolloutPercentage: z.number().int().min(0).max(100).nullish(),
        enabledFrom: isoDate.nullish(),
        enabledUntil: isoDate.nullish(),
    })
    .refine((v) => (v.scope === "TENANT") === Boolean(v.tenantUuid), {
        message: "tenantUuid is required for scope TENANT and not allowed for GLOBAL",
        path: ["tenantUuid"],
    })
    .refine((v) => v.rolloutType !== "PERCENTAGE" || typeof v.rolloutPercentage === "number", {
        message: "rolloutPercentage is required when rolloutType is PERCENTAGE",
        path: ["rolloutPercentage"],
    })
    .refine((v) => !v.enabledFrom || !v.enabledUntil || v.enabledFrom < v.enabledUntil, {
        message: "enabledFrom must be before enabledUntil",
        path: ["enabledUntil"],
    });

export const featureFlagListSchema = z.object({
    scope: z.enum(["GLOBAL", "TENANT", "USER"]).optional(),
    tenantUuid: z.string().uuid().optional(),
});

export const emailTemplateSchema = z
    .object({
        locale: z.string().trim().min(2).max(10).default("en"),
        subject: z.string().trim().min(1).max(300).optional(),
        bodyHtml: z.string().min(1).max(200_000).optional(),
        bodyText: z.string().max(100_000).nullish(),
        isActive: z.boolean().optional(),
    })
    .refine((v) => [v.subject, v.bodyHtml, v.bodyText, v.isActive].some((f) => f !== undefined), {
        message: "Nothing to update",
    });

const url = z.string().trim().url().max(2000).nullish();
const color = z.string().trim().regex(/^#[0-9a-f]{3,8}$/i, "color must be a hex value such as #1a2b3c").nullish();

// The fields a super admin may set on the platform branding row
export const brandingSchema = z
    .object({
        name: z.string().trim().max(120).nullish(),
        appName: z.string().trim().min(1).max(120).optional(),
        appTagline: z.string().trim().max(200).nullish(),
        companyName: z.string().trim().max(200).nullish(),
        logoUrl: url, logoLightUrl: url, logoDarkUrl: url, faviconUrl: url, bannerUrl: url,
        primaryColor: color, secondaryColor: color, accentColor: color, backgroundColor: color,
        textColor: color, errorColor: color, successColor: color, warningColor: color,
        fontFamily: z.string().trim().max(120).nullish(),
        headingFont: z.string().trim().max(120).nullish(),
        supportEmail: z.string().trim().email().nullish(),
        supportPhone: z.string().trim().max(40).nullish(),
        contactUrl: url, websiteUrl: url, facebookUrl: url, twitterUrl: url, instagramUrl: url, linkedinUrl: url,
        termsUrl: url, privacyUrl: url,
        emailLogoUrl: url,
        emailHeader: z.string().max(5000).nullish(),
        emailFooter: z.string().max(5000).nullish(),
        appIconUrl: url, splashScreenUrl: url,
        theme: z.string().trim().max(40).nullish(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const suspendTenantSchema = z.object({ reason });
export const banUserSchema = z.object({ reason });
