import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { SuperAdminAnalyticsController } from "../../controllers/superAdmin/SuperAdminAnalytics.controller.ts";

// Mounted at /api/admin/analytics. Platform-wide analytics, super admins only.
const router = express.Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));

router.get("/kpis", SuperAdminAnalyticsController.getKPIs);
router.get("/revenue", SuperAdminAnalyticsController.getRevenueTrend);       // ?months=1-36
router.get("/churn", SuperAdminAnalyticsController.getChurn);
router.get("/arpu-ltv", SuperAdminAnalyticsController.getArpuLtv);
router.get("/cohort-retention", SuperAdminAnalyticsController.getCohortRetention);
router.get("/tenant-growth", SuperAdminAnalyticsController.getTenantGrowth);
router.get("/fraud", SuperAdminAnalyticsController.getFraud);
router.get("/snapshots", SuperAdminAnalyticsController.getSnapshots);        // ?type=&limit=&tenantUuid=&storeUuid=

export default router;
