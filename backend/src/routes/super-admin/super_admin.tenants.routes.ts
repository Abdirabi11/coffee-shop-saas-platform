import express from "express";
import { activateTenant, suspendTenant, createTenant, getTenants, getSingleTenant, updateTenant, deleteTenant, updateTenantStatus 
} from "../../controllers/super-admin/tenant.controller.ts";

const router= express.Router();


router.post("/tenants/", createTenant);
router.get("/tenants", getTenants);
router.get("/tenants/:tenantUuid", getSingleTenant);
router.patch("/tenants/:tenantUuid", updateTenant);
router.patch("/tenants/:tenantUuid/status", updateTenantStatus);
router.delete("/tenants/:tenantUuid", deleteTenant);
router.post("/tenants/suspend", suspendTenant)
router.post("/tenants/activate", activateTenant)


// Controller Responsibilities
// Create coffee shop tenant
// View all tenants
// Update tenant info
// Activate / Suspend / Terminate tenant
// Soft delete tenants

export default router;