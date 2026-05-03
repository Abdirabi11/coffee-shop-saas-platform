import express from "express"
import { OrderController } from "../../controllers/order/Orders.controller.ts";
import { authenticate, authorize, requireStoreAccess } from "../../middlewares/auth.middleware.ts";
import { burstProtection } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router = express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// Burst protection (10 requests in 10 seconds)
router.use(burstProtection());

// Rate limiting per tenant (60 orders per hour max)
router.use(rateLimitByTenant({ points: 60, duration: 3600 }))

//Create order
router.post(
  "/",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN"),
  OrderController.create
);

//List orders
router.get(
  "/",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN"),
  OrderController.list
);

// 📊 ANALYTICS & REPORTING

//Get order statistics
router.get(
  "/stats",
  authorize("MANAGER", "TENANT_ADMIN"),
  requireStoreAccess,
  OrderController.getStats
);

//Get active orders (kitchen display)
router.get(
  "/active",
  authorize("CASHIER", "MANAGER", "TENANT_ADMIN"),
  requireStoreAccess,
  OrderController.getActive
);

//Get single order
router.get(
  "/:orderUuid",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN"),
  OrderController.getOne
);

//Get order timeline
router.get(
  "/:orderUuid/timeline",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN"),
  OrderController.getTimeline
);

//Update order status
router.patch(
  "/:orderUuid/status",
  authorize("CASHIER", "MANAGER", "TENANT_ADMIN"),
  OrderController.updateStatus
);

//Cancel order
router.post(
  "/:orderUuid/cancel",
  authorize("CUSTOMER", "MANAGER", "TENANT_ADMIN"),
  OrderController.cancel
);

//Add item to order (before payment)
router.post(
  "/:orderUuid/items",
  authorize("CUSTOMER", "CASHIER", "MANAGER"),
  OrderController.addItem
);

//Remove item from order (before payment)
router.delete(
  "/:orderUuid/items/:itemUuid",
  authorize("CUSTOMER", "CASHIER", "MANAGER"),
  OrderController.removeItem
);



export default router;