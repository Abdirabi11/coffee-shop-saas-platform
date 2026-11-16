import type { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { PlatformSettingsError, PlatformSettingsService } from "../../services/superAdmin/PlatformSettings.service.ts";
import { PlatformModerationService } from "../../services/superAdmin/PlatformModeration.service.ts";

// Super admin only (the router applies authenticate + authorize("SUPER_ADMIN")).
// Bodies are validated by the router (validators/platformAdmin.validator.ts).

function fail(res: Response, error: any, action: string) {
    if (error instanceof PlatformSettingsError) {
        return res.status(error.status).json({
            success: false,
            error: error.code,
            ...(error.message !== error.code && { message: error.message }),
        });
    }
    logWithContext("error", `[PlatformAdmin] ${action} failed`, { error: error.message });
    return res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR", message: `Failed to ${action}` });
}

const actor = (req: Request) => req.user!.userUuid;
const param = (req: Request, name: string) => String(req.params[name]);

export class PlatformSettingsController {
    // GET /api/admin/platform/maintenance
    static async getMaintenance(_req: Request, res: Response) {
        try {
            return res.json({ success: true, data: await PlatformSettingsService.getMaintenance() });
        } catch (error) {
            return fail(res, error, "load maintenance mode");
        }
    }

    // PUT /api/admin/platform/maintenance  { enabled, message?, reason? }
    static async setMaintenance(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.setMaintenance({ ...req.body, updatedBy: actor(req) });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "set maintenance mode");
        }
    }

    // PUT /api/admin/platform/finance  { taxRate, currency, reason? }
    static async setFinance(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.setFinance({ ...req.body, updatedBy: actor(req) });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "set finance settings");
        }
    }

    // GET /api/admin/platform/feature-flags?scope=&tenantUuid=
    static async listFeatureFlags(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.listFeatureFlags(req.query as any);
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "list feature flags");
        }
    }

    // PUT /api/admin/platform/feature-flags
    // { key, scope ("GLOBAL" | "TENANT"), tenantUuid?, enabled, name?, description?,
    //   category?, rolloutType?, rolloutPercentage?, enabledFrom?, enabledUntil? }
    // 201 when created, 200 when updated
    static async upsertFeatureFlag(req: Request, res: Response) {
        try {
            const { flag, created } = await PlatformSettingsService.upsertFeatureFlag({ ...req.body, updatedBy: actor(req) });
            return res.status(created ? 201 : 200).json({ success: true, data: flag });
        } catch (error) {
            return fail(res, error, "save feature flag");
        }
    }

    // DELETE /api/admin/platform/feature-flags/:flagUuid
    static async deleteFeatureFlag(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.deleteFeatureFlag(param(req, "flagUuid"), actor(req));
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "delete feature flag");
        }
    }

    // GET /api/admin/platform/email-templates
    static async listEmailTemplates(_req: Request, res: Response) {
        try {
            return res.json({ success: true, data: await PlatformSettingsService.listEmailTemplates() });
        } catch (error) {
            return fail(res, error, "list email templates");
        }
    }

    // PATCH /api/admin/platform/email-templates/:key  { locale?, subject?, bodyHtml?, bodyText?, isActive? }
    static async updateEmailTemplate(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.updateEmailTemplate({
                ...req.body,
                key: param(req, "key"),
                updatedBy: actor(req),
            });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "update email template");
        }
    }

    // GET /api/admin/platform/branding
    static async getBranding(_req: Request, res: Response) {
        try {
            return res.json({ success: true, data: await PlatformSettingsService.getBranding() });
        } catch (error) {
            return fail(res, error, "load branding");
        }
    }

    // PATCH /api/admin/platform/branding
    static async updateBranding(req: Request, res: Response) {
        try {
            const data = await PlatformSettingsService.updateBranding({ ...req.body, updatedBy: actor(req) });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "update branding");
        }
    }

    // POST /api/admin/platform/tenants/:tenantUuid/suspend  { reason }
    static async suspendTenant(req: Request, res: Response) {
        try {
            const data = await PlatformModerationService.suspendTenant({
                tenantUuid: param(req, "tenantUuid"),
                reason: req.body.reason,
                actorUuid: actor(req),
            });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "suspend tenant");
        }
    }

    // POST /api/admin/platform/tenants/:tenantUuid/reactivate
    static async reactivateTenant(req: Request, res: Response) {
        try {
            const data = await PlatformModerationService.reactivateTenant({
                tenantUuid: param(req, "tenantUuid"),
                actorUuid: actor(req),
            });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "reactivate tenant");
        }
    }

    // POST /api/admin/platform/users/:userUuid/ban  { reason }
    static async banUser(req: Request, res: Response) {
        try {
            const data = await PlatformModerationService.banUser({
                userUuid: param(req, "userUuid"),
                reason: req.body.reason,
                actorUuid: actor(req),
            });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "ban user");
        }
    }

    // POST /api/admin/platform/users/:userUuid/unban
    static async unbanUser(req: Request, res: Response) {
        try {
            const data = await PlatformModerationService.unbanUser({
                userUuid: param(req, "userUuid"),
                actorUuid: actor(req),
            });
            return res.json({ success: true, data });
        } catch (error) {
            return fail(res, error, "unban user");
        }
    }
}
