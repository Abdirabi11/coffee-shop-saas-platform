import express from "express"
import { SuperAdminDashboardController } from "../../controllers/superAdmin/SuperAdminDashboard.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

router.use(authenticate);
router.use(authorize(["SUPER_ADMIN"]));

//GET /api/admin/dashboard/overview
router.get("/overview", SuperAdminDashboardController.getOverview);

//GET /api/admin/dashboard/health
router.get("/health", SuperAdminDashboardController.getHealth);

//GET /api/admin/dashboard/revenue
router.get("/revenue", SuperAdminDashboardController.getRevenue);

//GET /api/admin/dashboard/tenants
router.get("/tenants", SuperAdminDashboardController.getTenants);

// GET /api/admin/dashboard/growth
router.get("/growth", SuperAdminDashboardController.getGrowth);

//GET /api/admin/dashboard/risk
router.get("/risk", SuperAdminDashboardController.getRisk);

// api/admin/dashboard/alerts
router.get("/alerts", SuperAdminDashboardController.getAlerts);

// GET /api/admin/dashboard/tenant-health
router.get("/tenant-health", SuperAdminDashboardController.getTenantHealth);

// GET /api/admin/dashboard/tenant-list
router.get("/tenant-list", SuperAdminDashboardController.getTenantList);

export default router;
