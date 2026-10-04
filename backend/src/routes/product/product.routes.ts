import express from "express"
import { ProductController } from "../../controllers/products/product.controller.ts";
import { ProductAvailabilityController } from "../../controllers/products/productAvailability.controller.ts";
import { ProductOptionController } from "../../controllers/products/productOption.controller.ts";
import { cache } from "../../middlewares/cache.middleware.ts";
import { rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { requireStoreAccess } from "../../middlewares/auth.middleware.ts";
import {authenticate, authorize} from "../../middlewares/auth.middleware.ts"


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
  authorize("ADMIN", "MANAGER"),
  ProductController.create
);

//List products
//Requires: Any authenticated user (ADMIN, MANAGER, CASHIER)
router.get("/products", cache((req) => `products:${req.tenant!.uuid}:${req.store!.uuid}`, 300), ProductController.list);

//Get single product
//Requires: Any authenticated user
router.get(
  "/:productUuid",
  authorize("ADMIN", "MANAGER", "CASHIER"),
  ProductController.getOne
);

//Update product
//Requires: ADMIN or MANAGER role
router.put(
  "/:productUuid",
  authorize("ADMIN", "MANAGER"),
  ProductController.update
);

//Delete product
//Requires: ADMIN role only

router.delete(
  "/:productUuid",
  authorize("ADMIN"),
  ProductController.delete
);

//Bulk update products
//Requires: ADMIN role only
router.patch(
  "/bulk",
  authorize("ADMIN"),
  ProductController.bulkUpdate
);

//Add availability schedule
//Requires: ADMIN or MANAGER role
router.post(
  "/:productUuid/availability",
  authorize("ADMIN", "MANAGER"),
  ProductAvailabilityController.create
);

//List availability schedules
//Requires: Any authenticated user
router.get(
  "/:productUuid/availability",
  authorize("ADMIN", "MANAGER", "CASHIER"),
  ProductAvailabilityController.list
);

//Check current availability
//Requires: Any authenticated user
router.get(
  "/:productUuid/availability/check",
  authorize("ADMIN", "MANAGER", "CASHIER"),
  ProductAvailabilityController.checkAvailability
);

/**
 * Update availability schedule
 * Requires: ADMIN or MANAGER role
 */
router.patch(
  "/availability/:uuid",
  authorize("ADMIN", "MANAGER"),
  ProductAvailabilityController.update
);

/**
 * Delete availability schedule
 * Requires: ADMIN or MANAGER role
 */
router.delete(
  "/availability/:uuid",
  authorize("ADMIN", "MANAGER"),
  ProductAvailabilityController.delete
);

// 🎛️ PRODUCT OPTIONS

//Create option group
//Requires: ADMIN or MANAGER role
router.post(
  "/:productUuid/option-groups",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.createGroup
);

//List option groups
//Requires: Any authenticated user
router.get(
  "/:productUuid/option-groups",
  authorize("ADMIN", "MANAGER", "CASHIER"),
  ProductOptionController.listGroups
);

//Update option group
//Requires: ADMIN or MANAGER role
router.patch(
  "/option-groups/:groupUuid",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.updateGroup
);

//Delete option group
//Requires: ADMIN or MANAGER role
router.delete(
  "/option-groups/:groupUuid",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.deleteGroup
);

//Create option
//Requires: ADMIN or MANAGER role
router.post(
  "/option-groups/:groupUuid/options",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.createOption
);

//Update option
//Requires: ADMIN or MANAGER role
router.patch(
  "/options/:optionUuid",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.updateOption
);

//Delete option
//Requires: ADMIN or MANAGER role
router.delete(
  "/options/:optionUuid",
  authorize("ADMIN", "MANAGER"),
  ProductOptionController.deleteOption
);


export default router;
