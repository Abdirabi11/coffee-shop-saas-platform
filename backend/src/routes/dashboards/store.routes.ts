import express from "express"
import { StoreDashboardController } from "../../controllers/dashboards/StoreDashboard.controller.ts";
import { authenticate, authorize, requireStoreContext } from "../../middlewares/auth.middleware.ts";

const router = express.Router();

router.use(authenticate);
router.use(requireStoreContext);
router.use(authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]));

//GET /api/store/dashboard/overview
router.get("/overview", StoreDashboardController.getOverview);

//GET /api/store/dashboard/active-orders
router.get("/active-orders", StoreDashboardController.getActiveOrders);

//GET /api/store/dashboard/peak-hours
router.get("/peak-hours", StoreDashboardController.getPeakHours);

//GET /api/store/dashboard/staff
router.get("/staff", StoreDashboardController.getStaff);

//GET /api/store/dashboard/products
router.get("/products", StoreDashboardController.getProducts);

export default router;

