import express from "express";
import { 
    DashboardOverview, 
    revenueSnapshot, 
    tenantDashboard,
    tenantHealth,
    subscriptionBreakdown,
    platformHealth,
    riskOverview
} from "../../controllers/super-admin/dashboard.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { cache } from "../../middlewares/cashe.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";


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
  superDashboardController.getDashboard
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