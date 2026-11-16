import express from "express";
import { checkPermission } from "../../middlewares/staff/checkPermission.middleware.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";
import { MenuValidators } from "../../validators/menu.validator.ts";
import { ProductAdminController } from "../../controllers/menu/admin/ProductAdmin.controller.ts";
import { CategoryAdminController } from "../../controllers/menu/admin/CategoryAdmin.controller.ts";
import { authenticate, storeOf } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { MenuController } from "../../controllers/menu/Menu.controller.ts";
import { MenuAnalyticsController } from "../../controllers/menu/Menuanalytics.controller.ts";
import { OptionGroupAdminController } from "../../controllers/menu/admin/OptionGroupAdmin.controller.ts";
import { MenuScheduleController } from "../../controllers/menu/admin/MenuSchedule.controller.ts";
import { validateZod } from "../../middlewares/validateZod.ts";
import {
    createOptionSchema,
    reorderCategoriesSchema,
    scheduleSchema,
    updateOptionGroupSchema,
    updateOptionSchema,
} from "../../validators/menuAdmin.validator.ts";


const router= express.Router();

router.use(authenticate);
router.use(requireTenantContext);

// Permission checks are at a store that belongs to the verified tenant:
//   - /stores/:storeUuid, /categories/:storeUuid ...: that store
//   - create / bulk routes: validateRequest runs FIRST, then the permission is
//     checked at the validated body.storeUuid the handler uses
//   - routes on one record: that record's own store (storeOf.record), never a
//     client-supplied storeUuid, so a record of another store or tenant is 404
const productStore = storeOf.record("product", "productUuid");
const categoryStore = storeOf.record("category", "categoryUuid");
const groupStore = storeOf.record("optionGroup", "groupUuid");
const optionStore = storeOf.option("optionUuid");

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
    validateRequest(MenuValidators.createCategory),
    checkPermission("menu.create"),
    CategoryAdminController.createCategory
);

// Body: { storeUuid, categoryUuids } — every category of the store, in menu order
router.post(
    "/categories/reorder",
    validateZod(reorderCategoriesSchema),
    checkPermission("menu.update"),
    MenuScheduleController.reorderCategories
);

// Replaces the category's days / time slots / date window (store-local)
router.put(
    "/categories/:categoryUuid/availability",
    checkPermission("menu.update", categoryStore),
    validateZod(scheduleSchema),
    MenuScheduleController.setCategorySchedule
);

router.patch(
    "/categories/:categoryUuid",
    checkPermission("menu.update", categoryStore),
    validateRequest(MenuValidators.updateCategory),
    CategoryAdminController.updateCategory
);

router.delete(
    "/categories/:categoryUuid",
    checkPermission("menu.delete", categoryStore),
    CategoryAdminController.deleteCategory
);

// ─── Products ───────────────────────────────────────────────
router.post(
    "/products",
    validateRequest(MenuValidators.createProduct),
    checkPermission("menu.create"),
    ProductAdminController.createProduct
);

router.patch(
    "/products/:productUuid",
    checkPermission("menu.update", productStore),
    validateRequest(MenuValidators.updateProduct),
    ProductAdminController.updateProduct
);

router.delete(
    "/products/:productUuid",
    checkPermission("menu.delete", productStore),
    ProductAdminController.deleteProduct
);

router.put(
    "/products/:productUuid/availability",
    checkPermission("menu.update", productStore),
    validateZod(scheduleSchema),
    MenuScheduleController.setProductSchedule
);

router.post(
    "/products/bulk/prices",
    validateRequest(MenuValidators.bulkUpdatePrices),
    checkPermission("menu.update"),
    ProductAdminController.bulkUpdatePrices
);

router.post(
    "/products/bulk/availability",
    validateRequest(MenuValidators.bulkUpdateAvailability),
    checkPermission("menu.update"),
    ProductAdminController.bulkUpdateAvailability
);

// ─── Option Groups ──────────────────────────────────────────
router.post(
    "/option-groups",
    validateRequest(MenuValidators.createOptionGroup),
    checkPermission("menu.create"),
    OptionGroupAdminController.createOptionGroup
);

router.get(
    "/option-groups/store/:storeUuid",
    checkPermission("menu.read"),
    OptionGroupAdminController.listOptionGroups
);

router.patch(
    "/option-groups/:groupUuid",
    checkPermission("menu.update", groupStore),
    validateZod(updateOptionGroupSchema),
    OptionGroupAdminController.updateOptionGroup
);

// Deactivates the group and its options (past orders still reference them)
router.delete(
    "/option-groups/:groupUuid",
    checkPermission("menu.delete", groupStore),
    OptionGroupAdminController.deleteOptionGroup
);

router.post(
    "/option-groups/:groupUuid/options",
    checkPermission("menu.create", groupStore),
    validateZod(createOptionSchema),
    OptionGroupAdminController.addOption
);

// ─── Options ────────────────────────────────────────────────
router.patch(
    "/options/:optionUuid",
    checkPermission("menu.update", optionStore),
    validateZod(updateOptionSchema),
    OptionGroupAdminController.updateOption
);

router.delete(
    "/options/:optionUuid",
    checkPermission("menu.delete", optionStore),
    OptionGroupAdminController.deleteOption
);

router.post(
    "/products/:productUuid/option-groups/:groupUuid",
    checkPermission("menu.update", productStore),
    OptionGroupAdminController.linkToProduct
);

router.delete(
  "/products/:productUuid/option-groups/:groupUuid",
  checkPermission("menu.delete", productStore),
  OptionGroupAdminController.unlinkFromProduct
);

export default router;
