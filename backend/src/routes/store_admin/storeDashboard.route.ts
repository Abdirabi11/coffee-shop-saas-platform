import express from "express"
import {
     activeOrders, peakHours, getStoreDashboard 
} from "../../controllers/store_admin/storeDashboard.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { authorize } from "../../middlewares/auth.middleware.ts";
import { requirePermission } from "../../middlewares/permission.middleware.ts";
import { tenantQuotaGuard } from "../../middlewares/quota.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { adminIpAllowlist } from "../../security/IpAllow.ts";
import { adminLimiter } from "../../utils/rateLimit.ts";


const router= express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));
router.use(adminLimiter);
router.use(adminIpAllowlist);

router.use(
     rateLimit({
       keyPrefix: "store-dashboard",
       limit: 60,
       windowSeconds: 60,
     })
);

// business protection
router.use(tenantQuotaGuard("DASHBOARD"));

router.get(
     "/store/dashboard",
     requirePermission("dashboard.store.view"),
     getStoreDashboard
   );
   
   router.get(
     "/store/active-orders",
     requirePermission("dashboard.store.orders"),
     activeOrders
   );
   
   router.get(
     "/store/peak-hours",
     requirePermission("dashboard.store.analytics"),
     peakHours
);