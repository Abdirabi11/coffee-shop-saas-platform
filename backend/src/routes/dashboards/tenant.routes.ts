import express from "express";
import { TenantDashboardController } from "../../controllers/dashboards/TenantDashboard.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";


const router = express.Router();

router.use(authenticate);
router.use(requireTenantContext);
router.use(authorize(["TENANT_ADMIN", "MANAGER"]));

//GET /api/tenant/dashboard/overview
router.get("/overview", TenantDashboardController.getOverview);

//GET /api/tenant/dashboard/stores
router.get("/stores", TenantDashboardController.getStores);

//GET /api/tenant/dashboard/products
router.get("/products", TenantDashboardController.getProducts);

//GET /api/tenant/dashboard/revenue
router.get("/revenue", TenantDashboardController.getRevenue);

//GET /api/tenant/dashboard/customers
router.get("/customers", TenantDashboardController.getCustomers);

//GET /api/tenant/dashboard/subscription
router.get("/subscription", TenantDashboardController.getSubscription);

export default router;