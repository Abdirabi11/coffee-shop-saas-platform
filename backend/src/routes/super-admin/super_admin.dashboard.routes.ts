import express from "express";
import { 
    DashboardOverview, 
    revenueSnap, 
    tenantDashboard,
    tenantHealth,
    subscriptionBreakdown,
    risk
} from "../../controllers/super-admin/dashboard.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { cache } from "../../middlewares/cashe.middleware.ts";


const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/dashboard/overview", cache("sa:dashboard:overview", 60), DashboardOverview);
router.get("/dashboard/revenue-snapshot", revenueSnap);
router.get("/dashboard/tenants", cache("sa:dashboard:tenants", 120), tenantDashboard);
router.get("/dashboard/tenant-health",cache("sa:dashboard:tenant-health", 120), tenantHealth);
router.get("/dashboard/subscription-breakdown", cache("sa:dashboard:subscriptions", 300), subscriptionBreakdown);
router.get("/dashboard/risk", risk);


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