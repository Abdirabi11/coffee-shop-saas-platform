import express from "express"
import { CategoryController } from "../../controllers/category/category.controller.ts";
import { requireStoreAccess } from "../../middlewares/auth.middleware.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";

const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);
router.use(requireStoreAccess);
router.use(rateLimitByTenant({ points: 100, duration: 60 }));

//Create category
//Allowed: TENANT_ADMIN, MANAGER
router.post(
    "/",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    CategoryController.create
);
  
//List categories
//Allowed: TENANT_ADMIN, MANAGER, CASHIER
router.get(
    "/",
    authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
    CategoryController.list
);
  
//Get single category
//Allowed: TENANT_ADMIN, MANAGER, CASHIER
router.get(
    "/:uuid",
    authorize(["TENANT_ADMIN", "MANAGER", "CASHIER"]),
    CategoryController.getOne
);
  
//Update category
//Allowed: TENANT_ADMIN, MANAGER
router.patch(
    "/:uuid",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    CategoryController.update
);
  
//Delete category
//Allowed: TENANT_ADMIN only
router.delete(
    "/:uuid",
    authorize(["TENANT_ADMIN"]),
    CategoryController.delete
);
  
//Reorder categories
//Allowed: TENANT_ADMIN, MANAGER
router.patch(
    "/reorder",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    CategoryController.reorder
);
  
//Get category analytics
//Allowed: TENANT_ADMIN, MANAGER
router.get(
    "/:uuid/analytics",
    authorize(["TENANT_ADMIN", "MANAGER"]),
    CategoryController.getAnalytics
);
  
export default router;
