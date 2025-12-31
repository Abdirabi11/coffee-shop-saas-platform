import express from "express";
import {
    getAnalyticsKPIs, revenueAnalytics, tenantGrowth, churnAnalytics, usageAnalytics, cohorts
} from "../../controllers/super-admin/analytics.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";


const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/analytics/kpis", getAnalyticsKPIs);
router.get("/analytics/revenue", revenueAnalytics);
router.get("/analytics/tenants-growth", tenantGrowth);
router.get("/analytics/churn", churnAnalytics);
router.get("/analytics/usage", usageAnalytics);
router.get("/analytics/cohorts", cohorts);

// GET /super-admin/analytics/revenue?from=2025-01-01&to=2025-12-31&groupBy=month
export default router;