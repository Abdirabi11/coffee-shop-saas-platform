import express from "express"
import { StoreDashboardController } from "../../controllers/dashboards/StoreDashboard.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";

// Mounted at /api/dashboards/store. The store comes from :storeUuid, and
// checkRole verifies it's in the tenant, checks the role held *at that store*
// and sets req.store, which the controller reads.
const router = express.Router();

const STORE_MANAGEMENT = ["MANAGER", "ADMIN", "TENANT_ADMIN"];
// No "STAFF": it is also a tenant role, and checkRole counts tenant roles at
// every store, so it would let any tenant STAFF member into any store
const STORE_FLOOR = [...STORE_MANAGEMENT, "SHIFT_SUPERVISOR", "CASHIER", "BARISTA", "KITCHEN_STAFF"];

const at = (roles: string[]) => [authenticate, requireTenantContext, checkRole(roles)];

// Revenue, staff and product figures: managers and up
//GET /api/dashboards/store/:storeUuid/overview
router.get("/:storeUuid/overview", ...at(STORE_MANAGEMENT), StoreDashboardController.getOverview);

//GET /api/dashboards/store/:storeUuid/staff
router.get("/:storeUuid/staff", ...at(STORE_MANAGEMENT), StoreDashboardController.getStaff);

//GET /api/dashboards/store/:storeUuid/products
router.get("/:storeUuid/products", ...at(STORE_MANAGEMENT), StoreDashboardController.getProducts);

// Operational views for anyone working the store
//GET /api/dashboards/store/:storeUuid/active-orders
router.get("/:storeUuid/active-orders", ...at(STORE_FLOOR), StoreDashboardController.getActiveOrders);

//GET /api/dashboards/store/:storeUuid/peak-hours
router.get("/:storeUuid/peak-hours", ...at(STORE_FLOOR), StoreDashboardController.getPeakHours);

export default router;
