import express from "express";
import { checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { OptionGroupAdminController } from "../../controllers/menu/admin/OptionGroupAdmin.controller.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";
import { MenuValidators } from "../../validators/menu.validator.ts";
import { ProductAdminController } from "../../controllers/menu/admin/ProductAdmin.controller.ts";
import { CategoryAdminController } from "../../controllers/menu/admin/CategoryAdmin.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";


const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// CATEGORIES

//GET /api/admin/menu/categories/:storeUuid
router.get(
  "/categories/:storeUuid",
  checkPermission("menu.read"),
  CategoryAdminController.getCategories
);

//POST /api/admin/menu/categories
router.post(
  "/categories",
  checkPermission("menu.create"),
  validateRequest(MenuValidators.createCategory),
  CategoryAdminController.createCategory
);

//PATCH /api/admin/menu/categories/:categoryUuid
router.patch(
  "/categories/:categoryUuid",
  checkPermission("menu.update"),
  validateRequest(MenuValidators.updateCategory),
  CategoryAdminController.updateCategory
);

//DELETE /api/admin/menu/categories/:categoryUuid
router.delete(
  "/categories/:categoryUuid",
  checkPermission("menu.delete"),
  CategoryAdminController.deleteCategory
);

// PRODUCTS

//POST /api/admin/menu/products
router.post(
  "/products",
  checkPermission("menu.create"),
  validateRequest(MenuValidators.createProduct),
  ProductAdminController.createProduct
);

//PATCH /api/admin/menu/products/:productUuid
router.patch(
  "/products/:productUuid",
  checkPermission("menu.update"),
  validateRequest(MenuValidators.updateProduct),
  ProductAdminController.updateProduct
);

//DELETE /api/admin/menu/products/:productUuid
router.delete(
  "/products/:productUuid",
  checkPermission("menu.delete"),
  ProductAdminController.deleteProduct
);

//POST /api/admin/menu/products/bulk/prices
router.post(
  "/products/bulk/prices",
  checkPermission("menu.update"),
  validateRequest(MenuValidators.bulkUpdatePrices),
  ProductAdminController.bulkUpdatePrices
);

//POST /api/admin/menu/products/bulk/availability
router.post(
  "/products/bulk/availability",
  checkPermission("menu.update"),
  validateRequest(MenuValidators.bulkUpdateAvailability),
  ProductAdminController.bulkUpdateAvailability
);

// OPTION GROUPS

//POST /api/admin/menu/option-groups
router.post(
  "/option-groups",
  checkPermission("menu.create"),
  validateRequest(MenuValidators.createOptionGroup),
  OptionGroupAdminController.createOptionGroup
);

//POST /api/admin/menu/option-groups/:groupUuid/options
router.post(
  "/option-groups/:groupUuid/options",
  checkPermission("menu.create"),
  validateRequest(MenuValidators.createOption),
  OptionGroupAdminController.addOption
);

//POST /api/admin/menu/products/:productUuid/option-groups/:groupUuid
router.post(
  "/products/:productUuid/option-groups/:groupUuid",
  checkPermission("menu.update"),
  OptionGroupAdminController.linkToProduct
);

//DELETE /api/admin/menu/products/:productUuid/option-groups/:groupUuid
router.delete(
  "/products/:productUuid/option-groups/:groupUuid",
  checkPermission("menu.delete"),
  OptionGroupAdminController.unlinkFromProduct
);

export default router;
