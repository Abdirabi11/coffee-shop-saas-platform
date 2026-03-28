import express from "express"
import { ProductController } from "../../controllers/products/product.controller.ts";
import { ProductAvailabilityController } from "../../controllers/products/productAvailability.controller.ts";
import { ProductOptionController } from "../../controllers/products/productOption.controller.ts";
import { cache } from "../../middlewares/cache.middleware.ts";
import { rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { requireStoreAccess } from "../middlewares/auth.middleware.ts";
import {authenticate, authorize} from "../middlewares/auth.middleware.ts"


const router = express.Router()

router.use(authenticate);
router.use(requireTenantContext);
router.use(requireStoreAccess);

// Rate limiting per tenant (100 requests per minute)
router.use(rateLimitByTenant({ points: 100, duration: 60 }));

//Create product
//Requires: ADMIN or MANAGER role
router.post(
  "/",
  authorize(["ADMIN", "MANAGER"]),
  ProductController.create
);

//List products
//Requires: Any authenticated user (ADMIN, MANAGER, CASHIER)
router.get("/products", cache((req) => `products:${req.store!.uuid}`, 300), ProductController.list);

//Get single product
//Requires: Any authenticated user
router.get(
  "/:productUuid",
  authorize(["ADMIN", "MANAGER", "CASHIER"]),
  ProductController.getOne
);

//Update product
//Requires: ADMIN or MANAGER role
router.put(
  "/:productUuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductController.update
);

//Delete product
//Requires: ADMIN role only

router.delete(
  "/:productUuid",
  authorize(["ADMIN"]),
  ProductController.delete
);

//Bulk update products
//Requires: ADMIN role only
router.patch(
  "/bulk",
  authorize(["ADMIN"]),
  ProductController.bulkUpdate
);

//Add availability schedule
//Requires: ADMIN or MANAGER role
router.post(
  "/:productUuid/availability",
  authorize(["ADMIN", "MANAGER"]),
  ProductAvailabilityController.create
);

//List availability schedules
//Requires: Any authenticated user
router.get(
  "/:productUuid/availability",
  authorize(["ADMIN", "MANAGER", "CASHIER"]),
  ProductAvailabilityController.list
);

//Check current availability
//Requires: Any authenticated user
router.get(
  "/:productUuid/availability/check",
  authorize(["ADMIN", "MANAGER", "CASHIER"]),
  ProductAvailabilityController.checkAvailability
);

/**
 * Update availability schedule
 * Requires: ADMIN or MANAGER role
 */
router.patch(
  "/availability/:uuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductAvailabilityController.update
);

/**
 * Delete availability schedule
 * Requires: ADMIN or MANAGER role
 */
router.delete(
  "/availability/:uuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductAvailabilityController.delete
);

// 🎛️ PRODUCT OPTIONS

//Create option group
//Requires: ADMIN or MANAGER role
router.post(
  "/:productUuid/option-groups",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.createGroup
);

//List option groups
//Requires: Any authenticated user
router.get(
  "/:productUuid/option-groups",
  authorize(["ADMIN", "MANAGER", "CASHIER"]),
  ProductOptionController.listGroups
);

//Update option group
//Requires: ADMIN or MANAGER role
router.patch(
  "/option-groups/:groupUuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.updateGroup
);

//Delete option group
//Requires: ADMIN or MANAGER role
router.delete(
  "/option-groups/:groupUuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.deleteGroup
);

//Create option
//Requires: ADMIN or MANAGER role
router.post(
  "/option-groups/:groupUuid/options",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.createOption
);

//Update option
//Requires: ADMIN or MANAGER role
router.patch(
  "/options/:optionUuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.updateOption
);

//Delete option
//Requires: ADMIN or MANAGER role
router.delete(
  "/options/:optionUuid",
  authorize(["ADMIN", "MANAGER"]),
  ProductOptionController.deleteOption
);


export default router;


router.use(authenticate);
router.use(requireTenantContext);
router.use(requireStoreAccess);

// ═══════════════════════════════════════════════════════════
// 📦 PRODUCT CRUD
// ═══════════════════════════════════════════════════════════

/**
 * Create product
 * Allowed: TENANT_ADMIN, MANAGER
 */
router.post(
  "/",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductController.create
);

/**
 * List products
 * Allowed: TENANT_ADMIN, MANAGER, CASHIER
 */
router.get(
  "/",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  ProductController.list
);

/**
 * Get single product
 * Allowed: TENANT_ADMIN, MANAGER, CASHIER
 */
router.get(
  "/:productUuid",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  ProductController.getOne
);

/**
 * Update product
 * Allowed: TENANT_ADMIN, MANAGER
 */
router.put(
  "/:productUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductController.update
);

/**
 * Delete product
 * Allowed: TENANT_ADMIN only (hard delete)
 * Managers can only soft delete via update endpoint
 */
router.delete(
  "/:productUuid",
  authorize(["TENANT_ADMIN"]),
  ProductController.delete
);

/**
 * Bulk update products
 * Allowed: TENANT_ADMIN only
 */
router.patch(
  "/bulk",
  authorize(["TENANT_ADMIN"]),
  ProductController.bulkUpdate
);

/**
 * Search products
 * Allowed: TENANT_ADMIN, MANAGER, CASHIER
 */
router.get(
  "/search",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  ProductController.search
);

// ═══════════════════════════════════════════════════════════
// ⏰ PRODUCT AVAILABILITY
// ═══════════════════════════════════════════════════════════

router.post(
  "/:productUuid/availability",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductAvailabilityController.create
);

router.get(
  "/:productUuid/availability",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  ProductAvailabilityController.list
);

router.patch(
  "/availability/:uuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductAvailabilityController.update
);

router.delete(
  "/availability/:uuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductAvailabilityController.delete
);

// ═══════════════════════════════════════════════════════════
// 🎛️ PRODUCT OPTIONS
// ═══════════════════════════════════════════════════════════

router.post(
  "/:productUuid/option-groups",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductOptionController.createGroup
);

router.get(
  "/:productUuid/option-groups",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  ProductOptionController.listGroups
);

router.patch(
  "/option-groups/:groupUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductOptionController.updateGroup
);

router.delete(
  "/option-groups/:groupUuid",
  authorize(["TENANT_ADMIN"]), // Only admin can delete groups
  ProductOptionController.deleteGroup
);

router.post(
  "/option-groups/:groupUuid/options",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductOptionController.createOption
);

router.patch(
  "/options/:optionUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductOptionController.updateOption
);

router.delete(
  "/options/:optionUuid",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  ProductOptionController.deleteOption
);

// ═══════════════════════════════════════════════════════════
// 📊 INVENTORY MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Adjust inventory manually
 * Allowed: TENANT_ADMIN, MANAGER
 */
router.post(
  "/:productUuid/inventory/adjust",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  InventoryController.adjust
);

/**
 * Get inventory status
 * Allowed: TENANT_ADMIN, MANAGER, CASHIER
 */
router.get(
  "/:productUuid/inventory/status",
  authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
  InventoryController.getStatus
);

/**
 * Get inventory movement history
 * Allowed: TENANT_ADMIN, MANAGER
 */
router.get(
  "/:productUuid/inventory/movements",
  authorize(["TENANT_ADMIN", "MANAGER"]),
  InventoryController.getMovements
);

export default router;