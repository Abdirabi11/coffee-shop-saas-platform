import express from "express"
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { 
    activeOrders, 
    failedPayments, 
    getRevenue, 
    peakHours, 
} from "../controllers/admin.dashboard.controller.ts";
import {authenticate, authorize} from "../middlewares/auth.middleware.ts"
import { adminIpAllowlist } from "../utils/IpAllow.ts";
import { adminLimiter } from "../utils/rateLimit.ts";


const router= express.Router();

router.use(authenticate);
router.use(authorize("ADMIN"));
router.use(adminLimiter);
router.use(adminIpAllowlist);

router.use(
  authenticate,
  authorize("ADMIN"),
  rateLimit({
    keyPrefix: "tenant-admin",
    limit: 60,
    windowSeconds: 60,
  })
);

router.get("/dashboard", dashboardController.getDashboard);
router.get("/active-orders", activeOrders);
router.get("/revenue", authorize("MANAGER", "ADMIN"), getRevenue);
router.get("/peak-hours", peakHours);
router.get("/failed-payments", failedPayments);



export default router;