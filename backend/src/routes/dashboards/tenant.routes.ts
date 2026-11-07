import express from "express"
import { TenantDashboardController } from "../../controllers/dashboards/TenantDashboard.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

// Mounted at /api/dashboards/tenant. Tenant-wide figures: tenant-level admins
// only (authorize is tenant scope, so store roles never count here).
const router = express.Router();

router.use(authenticate, requireTenantContext, authorize("ADMIN", "TENANT_ADMIN"));

router.get("/overview", TenantDashboardController.getOverview);
router.get("/stores", TenantDashboardController.getStores);
router.get("/products", TenantDashboardController.getProducts);
router.get("/revenue", TenantDashboardController.getRevenue);
router.get("/customers", TenantDashboardController.getCustomers);
router.get("/subscription", TenantDashboardController.getSubscription);

export default router;
