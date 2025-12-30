import express from "express";
import { totalRevenue, activeTenants, overview} from "../../controllers/super-admin/analytics.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";


const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/analytics/revenue", revenueAnalytics);
router.get("/analytics/tenants-growth", tenantGrowth);
router.get("/analytics/churn", churn);
router.get("/analytics/usage", usage);


// Controller Responsibilities
// Total revenue
// Active tenants
// Churn rate
// Trial conversions
// 🧠 READ ONLY – never touching store data directly

// Revenue Analytics
// GET /super-admin/analytics/revenue
// Filters, from, to ,groupBy=day|week|month
// [
//   { "date": "2025-01-01", "revenue": 320 },
//   { "date": "2025-01-02", "revenue": 410 }
// ]

// Tenant Growth
// GET /super-admin/analytics/tenants-growth
// [
//   { "month": "Jan", "newTenants": 14 },
//   { "month": "Feb", "newTenants": 21 }
// ]

// Churn & Retention
// GET /super-admin/analytics/churn
// {
//   "churnRate": 3.2,
//   "retentionRate": 96.8
// }

// Store & Order Volume
// GET /super-admin/analytics/usage
// {
//   "storesCreated": [...],
//   "ordersPlaced": [...]
// }



export default router;