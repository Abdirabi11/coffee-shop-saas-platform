import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { rateLimitByIP } from "../../middlewares/menu/Ratelimitbyip.middleware.ts";
import { validateZod } from "../../middlewares/validateZod.ts";
import { PlatformSettingsController } from "../../controllers/superAdmin/platformSettings.controller.ts";
import {
    banUserSchema,
    brandingSchema,
    emailTemplateSchema,
    featureFlagListSchema,
    featureFlagSchema,
    financeSchema,
    maintenanceSchema,
    suspendTenantSchema,
} from "../../validators/platformAdmin.validator.ts";

// Mounted at /api/admin/platform. Super admins only: authorize lets
// SUPER_ADMIN (User.globalRole, read from the DB) through without a tenant
// context. These routes stay reachable during maintenance (maintenanceGuard)
// so maintenance can be switched off again.
const router = express.Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));
router.use(rateLimitByIP({ points: 120, duration: 60 }));

// ─── Maintenance & platform settings ───
router.get("/maintenance", PlatformSettingsController.getMaintenance);
router.put("/maintenance", validateZod(maintenanceSchema), PlatformSettingsController.setMaintenance);
router.put("/finance", validateZod(financeSchema), PlatformSettingsController.setFinance);

// ─── Feature flags ───
router.get("/feature-flags", validateZod(featureFlagListSchema, "query"), PlatformSettingsController.listFeatureFlags);
router.put("/feature-flags", validateZod(featureFlagSchema), PlatformSettingsController.upsertFeatureFlag);
router.delete("/feature-flags/:flagUuid", PlatformSettingsController.deleteFeatureFlag);

// ─── Email templates (system defaults) & branding ───
router.get("/email-templates", PlatformSettingsController.listEmailTemplates);
router.patch("/email-templates/:key", validateZod(emailTemplateSchema), PlatformSettingsController.updateEmailTemplate);
router.get("/branding", PlatformSettingsController.getBranding);
router.patch("/branding", validateZod(brandingSchema), PlatformSettingsController.updateBranding);

// ─── Tenant & user moderation ───
router.post("/tenants/:tenantUuid/suspend", validateZod(suspendTenantSchema), PlatformSettingsController.suspendTenant);
router.post("/tenants/:tenantUuid/reactivate", PlatformSettingsController.reactivateTenant);
router.post("/users/:userUuid/ban", validateZod(banUserSchema), PlatformSettingsController.banUser);
router.post("/users/:userUuid/unban", PlatformSettingsController.unbanUser);

export default router;
