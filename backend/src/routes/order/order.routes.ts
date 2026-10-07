import express from "express"
import { OrderController } from "../../controllers/order/Order.controller.ts";
import { authenticate, authorize, authorizeOrder, requireStoreAccess } from "../../middlewares/auth.middleware.ts";
import { burstProtection, rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router = express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// Burst protection (10 requests in 10 seconds)
router.use(burstProtection());

// Per user within the tenant. Reads are generous so kitchen display / order
// screen polling doesn't starve writes; writes are capped separately.
router.use(rateLimitByTenant({ points: 300, duration: 60, keyPrefix: "order:read", methods: ["GET"] }));
router.use(rateLimitByTenant({ points: 60, duration: 60, keyPrefix: "order:write", methods: ["POST", "PUT", "PATCH", "DELETE"] }));

//Create order
router.post(
  "/",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN",  "ADMIN"),
  OrderController.create
);

//List orders
router.get(
  "/",
  authorize("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  OrderController.list
);

// 📊 ANALYTICS & REPORTING

//Get order statistics
router.get(
  "/stats",
  authorize("MANAGER", "TENANT_ADMIN", "ADMIN"),
  // requireStoreAccess,
  OrderController.getStats
);

//Get active orders (kitchen display)
router.get(
  "/active",
  authorize("CASHIER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  // requireStoreAccess,
  OrderController.getActive
);

// Routes on a single order use authorizeOrder: staff roles are checked at
// the order's own store, and CUSTOMER only passes for the order's customer.

//Get single order
router.get(
  "/:orderUuid",
  authorizeOrder("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  OrderController.getOne
);

//Get order timeline
router.get(
  "/:orderUuid/timeline",
  authorizeOrder("CUSTOMER", "CASHIER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  OrderController.getTimeline
);

//Update order status
router.patch(
  "/:orderUuid/status",
  authorizeOrder("CASHIER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  OrderController.updateStatus
);

//Cancel order
router.post(
  "/:orderUuid/cancel",
  authorizeOrder("CUSTOMER", "MANAGER", "TENANT_ADMIN", "ADMIN"),
  OrderController.cancel
);

//Add item to order (before payment)
router.post(
  "/:orderUuid/items",
  authorizeOrder("CUSTOMER", "CASHIER", "MANAGER", "ADMIN"),
  OrderController.addItem
);

//Remove item from order (before payment)
router.delete(
  "/:orderUuid/items/:itemUuid",
  authorizeOrder("CUSTOMER", "CASHIER", "MANAGER", "ADMIN"),
  OrderController.removeItem
);



export default router;