import express from "express"
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

router.use(adminLimiter);
router.use(adminIpAllowlist);

router.get("/active-orders", authenticate, authorize("ADMIN"), activeOrders); 
router.get("/revenue", authenticate, authorize("MANAGER", "ADMIN"), getRevenue);
router.get("/peak-hours", authenticate, authorize("ADMIN"), peakHours); 
router.get("/failed-Payments", authenticate, authorize("ADMIN"), failedPayments);


export default router;