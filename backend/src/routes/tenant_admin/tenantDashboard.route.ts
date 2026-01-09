import express from "express"
import { getTenantDashboard } from "../../controllers/tenant_admin/tanantDashboard.controller.ts";
import { requirePermission } from "../../middlewares/permission.middleware.ts";
import { tenantQuotaGuard } from "../../middlewares/quota.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { 
    activeOrders, 
    failedPayments, 
    getRevenue, 
} from "../controllers/admin.dashboard.controller.ts";
import {authenticate, authorize} from "../middlewares/auth.middleware.ts"
import { adminIpAllowlist } from "../utils/IpAllow.ts";


const router= express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));
router.use(adminIpAllowlist);

router.use( rateLimit({ keyPrefix: "tenant-dashboard", limit: 60, windowSeconds: 60, }) );

router.use(tenantQuotaGuard("DASHBOARD"));

router.use(
  authenticate,
  authorize("ADMIN"),
  rateLimit({
    keyPrefix: "tenant-admin",
    limit: 60,
    windowSeconds: 60,
  })
);

router.get("/tenant/dashboard", authorize("ADMIN"), getTenantDashboard);

router.get(
  "/dashboard",
  requirePermission("dashboard.tenant.view"),
  dashboardController.getDashboard
);

router.get( "/active-orders", requirePermission("dashboard.tenant.orders"), activeOrders );
router.get( "/revenue", requirePermission("dashboard.tenant.revenue"), getRevenue );
router.get( "/failed-payments",  requirePermission("dashboard.tenant.payments"), failedPayments );



export default router;