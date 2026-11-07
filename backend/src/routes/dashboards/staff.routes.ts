import express from "express"
import { StaffDashboardController } from "../../controllers/dashboards/StaffDashboard.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";

// Mounted at /api/dashboards/staff. A staff member's own shift dashboard at
// one store: they must hold a role at that store (checkRole on :storeUuid).
const router = express.Router();

// No "STAFF": it is also a tenant role, and checkRole counts tenant roles at
// every store, so it would pass a tenant STAFF member at any store
const STORE_STAFF = ["MANAGER", "ADMIN", "TENANT_ADMIN", "SHIFT_SUPERVISOR", "CASHIER", "BARISTA", "KITCHEN_STAFF"];

//GET /api/dashboards/staff/stores/:storeUuid/me
router.get(
    "/stores/:storeUuid/me",
    authenticate,
    requireTenantContext,
    checkRole(STORE_STAFF),
    StaffDashboardController.getDashboard
);

export default router;
