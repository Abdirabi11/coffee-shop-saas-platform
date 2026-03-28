import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { SuperAdminDashboardController } from "../../controllers/superAdmin/SuperAdminDashboard.controller.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";


const router= express.Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));

router.get(
  "/dashboard",
  rateLimit({
    keyPrefix: "super-dashboard",
    limit: 30,
    windowSeconds: 60,
  }),
  SuperAdminDashboardController.getDashboard
);

router.get(
  "/dashboard/health",
  rateLimit({
    keyPrefix: "super-dashboard-health",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getHealth
);

router.get(
  "/dashboard/revenue-snapshot",
  rateLimit({
    keyPrefix: "super-dashboard-revenue",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getRevenueSnapshot
);

router.get(
  "/dashboard/tenants",
  rateLimit({
    keyPrefix: "super-dashboard-tenants",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getTenants
);

router.get(
  "/dashboard/tenant-health",
  rateLimit({
    keyPrefix: "super-dashboard-tenant-health",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getTenantHealth
);

router.get(
  "/dashboard/subscription-breakdown",
  rateLimit({
    keyPrefix: "super-dashboard-subscriptions",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getSubscriptionBreakdown
);

router.get(
  "/dashboard/risk-overview",
  rateLimit({
    keyPrefix: "super-dashboard-risk",
    limit: 30,
    windowSeconds: 60,
  }),
  superDashboardController.getRiskOverview
);


// fraudOverview
// fraudEvents
// highRiskUsers
// suspiciousSessions


//FRAUD DASHBOARD: 

// GET /admin/fraud/overview
// GET /admin/fraud/events
// GET /admin/fraud/users/high-risk
// GET /admin/fraud/sessions/suspicious


// Revenue Snapshot (quick business view)
// GET /super-admin/dashboard/revenue-snapshot
// Shows, Today, This month, MRR, ARPU
// {
//   "today": 420,
//   "thisMonth": 12450,
//   "mrr": 6830,
//   "arpu": 69.7
// }

//risk
// Excessive API usage ,Suspicious signups, Blocked tenants
// "rateLimitedTenants": 3,
//   "blockedTenants": 2,
//   "suspiciousActivity": 5
export default router;


const superAdminOnly = [authenticate, checkRole(["SUPER_ADMIN"])];
 
// ────────────────────────────────────────────────────────────────────────────
// DASHBOARD ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────
 
// Overview (optional date range filter)
router.get(
  "/admin/dashboard/overview",
  ...superAdminOnly,
  validateRequest(dateRangeSchema, "query"),
  SuperAdminDashboardController.getOverview
);
 
// Platform health (last 24h/7d metrics)
router.get(
  "/admin/dashboard/health",
  ...superAdminOnly,
  SuperAdminDashboardController.getHealth
);
 
// Revenue breakdown (required date range)
router.get(
  "/admin/dashboard/revenue",
  ...superAdminOnly,
  validateRequest(dateRangeRequiredSchema, "query"),
  SuperAdminDashboardController.getRevenue
);
 
// Tenant analytics + top tenants (required date range)
router.get(
  "/admin/dashboard/tenants",
  ...superAdminOnly,
  validateRequest(dateRangeRequiredSchema, "query"),
  SuperAdminDashboardController.getTenants
);
 
// Growth metrics — period-over-period (required date range)
router.get(
  "/admin/dashboard/growth",
  ...superAdminOnly,
  validateRequest(dateRangeRequiredSchema, "query"),
  SuperAdminDashboardController.getGrowth
);
 
// Risk overview (fraud, sessions, failed payments)
router.get(
  "/admin/dashboard/risk",
  ...superAdminOnly,
  SuperAdminDashboardController.getRisk
);
 
// System alerts
router.get(
  "/admin/dashboard/alerts",
  ...superAdminOnly,
  validateRequest(limitSchema, "query"),
  SuperAdminDashboardController.getAlerts
);
 
// Tenant health (past-due, near limits, suspended)
router.get(
  "/admin/dashboard/tenant-health",
  ...superAdminOnly,
  SuperAdminDashboardController.getTenantHealth
);
 
// Tenant list with pagination
router.get(
  "/admin/dashboard/tenant-list",
  ...superAdminOnly,
  validateRequest(tenantListSchema, "query"),
  SuperAdminDashboardController.getTenantList
);
 
// ────────────────────────────────────────────────────────────────────────────
// ANALYTICS ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────
 
// Live KPIs (MRR, ARPU, revenue growth, orders)
router.get(
  "/admin/analytics/kpis",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getKPIs
);
 
// Revenue trend (from monthly snapshots)
router.get(
  "/admin/analytics/revenue",
  ...superAdminOnly,
  validateRequest(limitSchema, "query"),
  SuperAdminAnalyticsController.getRevenueTrend
);
 
// Churn analytics (from churn snapshots)
router.get(
  "/admin/analytics/churn",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getChurn
);
 
// ARPU & LTV (from ARPU_LTV snapshots)
router.get(
  "/admin/analytics/arpu-ltv",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getArpuLtv
);
 
// Cohort retention (from cohort snapshots)
router.get(
  "/admin/analytics/cohort-retention",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getCohortRetention
);
 
// Tenant cohort growth
router.get(
  "/admin/analytics/tenant-growth",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getTenantGrowth
);
 
// Fraud analytics (live computed)
router.get(
  "/admin/analytics/fraud",
  ...superAdminOnly,
  SuperAdminAnalyticsController.getFraud
);
 
// Generic snapshots query
router.get(
  "/admin/analytics/snapshots",
  ...superAdminOnly,
  validateRequest(snapshotQuerySchema, "query"),
  SuperAdminAnalyticsController.getSnapshots
);
 
export default router;
 