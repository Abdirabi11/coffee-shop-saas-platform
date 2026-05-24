import express from "express";
import { checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";
import { MenuValidators } from "../../validators/menu.validator.ts";
import { ProductAdminController } from "../../controllers/menu/admin/ProductAdmin.controller.ts";
import { CategoryAdminController } from "../../controllers/menu/admin/CategoryAdmin.controller.ts";
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { MenuController } from "../../controllers/menu/Menu.controller.ts";
import { MenuAnalyticsController } from "../../controllers/menu/Menuanalytics.controller.ts";
import { OptionGroupAdminController } from "../../controllers/menu/admin/OptionGroupAdmin.controller.ts";


const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// ─── Menu Preview & Cache ───────────────────────────────────
router.get(
    "/stores/:storeUuid/preview",
    checkPermission("menu.read"),
    MenuController.getMenuPreview
);

router.post(
    "/stores/:storeUuid/prewarm",
    checkPermission("menu.update"),
    MenuController.prewarmMenu
);

// ─── Analytics Summary ──────────────────────────────────────
router.get(
    "/analytics/:storeUuid/summary",
    checkPermission("menu.read"),
    MenuAnalyticsController.getSummary
);

// ─── Categories ─────────────────────────────────────────────
router.get(
    "/categories/:storeUuid",
    checkPermission("menu.read"),
    CategoryAdminController.getCategories
);

router.post(
    "/categories",
    checkPermission("menu.create"),
    validateRequest(MenuValidators.createCategory),
    CategoryAdminController.createCategory
);

router.patch(
    "/categories/:categoryUuid",
    checkPermission("menu.update"),
    validateRequest(MenuValidators.updateCategory),
    CategoryAdminController.updateCategory
);

router.delete(
    "/categories/:categoryUuid",
    checkPermission("menu.delete"),
    CategoryAdminController.deleteCategory
);

// ─── Products ───────────────────────────────────────────────
router.post(
    "/products",
    checkPermission("menu.create"),
    validateRequest(MenuValidators.createProduct),
    ProductAdminController.createProduct
);

router.patch(
    "/products/:productUuid",
    checkPermission("menu.update"),
    validateRequest(MenuValidators.updateProduct),
    ProductAdminController.updateProduct
);

router.delete(
    "/products/:productUuid",
    checkPermission("menu.delete"),
    ProductAdminController.deleteProduct
);

router.post(
    "/products/bulk/prices",
    checkPermission("menu.update"),
    validateRequest(MenuValidators.bulkUpdatePrices),
    ProductAdminController.bulkUpdatePrices
);

router.post(
    "/products/bulk/availability",
    checkPermission("menu.update"),
    validateRequest(MenuValidators.bulkUpdateAvailability),
    ProductAdminController.bulkUpdateAvailability
);

// ─── Option Groups ──────────────────────────────────────────
router.post(
    "/option-groups",
    checkPermission("menu.create"),
    validateRequest(MenuValidators.createOptionGroup),
    OptionGroupAdminController.createOptionGroup
);

router.post(
    "/option-groups/:groupUuid/options",
    checkPermission("menu.create"),
    validateRequest(MenuValidators.createOption),
    OptionGroupAdminController.addOption
);

router.post(
    "/products/:productUuid/option-groups/:groupUuid",
    checkPermission("menu.update"),
    OptionGroupAdminController.linkToProduct
);

router.delete(
  "/products/:productUuid/option-groups/:groupUuid",
  checkPermission("menu.delete"),
  OptionGroupAdminController.unlinkFromProduct
);

export default router;
