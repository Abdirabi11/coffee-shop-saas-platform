import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { requireIPWhitelist } from "../../middlewares/ipWhitelist.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// Tenant settings (Admin only)
router.get(
    "/tenant",
    authorize(["TENANT_ADMIN"]),
    SettingsController.getTenantSettings
);

router.patch(
    "/tenant",
    authorize(["TENANT_ADMIN"]),
    requireIPWhitelist("TENANT_SETTINGS"), // IP whitelist for sensitive operations
    SettingsController.updateTenantSettings
);

// Store settings (Manager+)
router.get(
    "/store/:storeUuid",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    SettingsController.getStoreSettings
);

router.patch(
    "/store/:storeUuid",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    SettingsController.updateStoreSettings
);

// User preferences (Any authenticated user)
router.get("/preferences", SettingsController.getUserPreferences);
router.patch("/preferences", SettingsController.updateUserPreferences);

export default router;
