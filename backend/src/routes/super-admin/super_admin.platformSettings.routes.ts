import express from "express";
import { 
    getBranding, listEmailTemplates, listFeatureFlags, setGlobalFinanceSettings, 
    setMaintenanceMode, updateBranding, updateEmailTemplate, upsertFeatureFlag 
} from "../../controllers/super-admin/platformSettings.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.post("/maintenance", setMaintenanceMode);
router.get("/feature-flags", listFeatureFlags);
router.post("/feature-flags", upsertFeatureFlag);
router.post("/finance", setGlobalFinanceSettings);
router.get("/email-templates", listEmailTemplates);
router.put("/email-templates/:key", updateEmailTemplate);
router.get("/branding", getBranding);
router.put("/branding", updateBranding);

export default router;
