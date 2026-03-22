import express from "express";
import { getMenuPreview } from "../../controllers/menu/menu-preview.controller.ts";
import { getStoreMenu, MenuController, prewarmMenu } from "../../controllers/menu/menu.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { rateLimit } from "../../middlewares/rateLimit.middleware.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";
import { requireTenantHeader } from "../../middlewares/menu/requireTenantHeader.ts";
import { MenuValidators } from "../../validators/menu.validator.ts";
import { menuRateLimit, searchRateLimit } from "../../middlewares/menu/rateLimit.ts";
import { menuCacheControl } from "../../middlewares/menu/cache.controller.ts";

const router= express.Router()


// Public endpoint (customer-facing)
router.get("/stores/:storeUuid/menu", getStoreMenu);


router.get(
    "/admin/stores/:storeUuid/menu/preview",
    authenticate,
    authorize("ADMIN", "MANAGER"),
    getMenuPreview
);

router.post(
  "/stores/:storeUuid/menu/prewarm",
  authenticate,
  authorize("ADMIN"),
  prewarmMenu
);

router.use(rateLimitByIP({ points: 60, duration: 60 })); // 60 req/min per IP

router.get("/menu/:storeUuid", MenuController.getMenu);
router.get("/products/:productUuid", MenuController.getProduct);
router.post("/products/validate", MenuController.validateOrder);1

/**
 * GET /api/menu/:storeUuid
 * Get public menu (no auth required)
 */
router.get(
    "/:storeUuid",
    requireTenantHeader,
    rateLimit({ max: 100, windowMs: 60000 }), // 100 req/min
    MenuController.getMenu
);

/**
 * GET /api/menu/products/:productUuid
 * Get single product details
 */
router.get(
    "/products/:productUuid",
    requireTenantHeader,
    MenuController.getProduct
);

/**
 * POST /api/menu/validate
 * Validate product + options before cart
 */
router.post(
    "/validate",
    requireTenantHeader,
    validateRequest(MenuValidators.validateOrder),
    MenuController.validateOrder
);

/**
 * POST /api/menu/favorites/toggle
 * Toggle product favorite (auth required)
 */
router.post(
    "/favorites/toggle",
    authenticate,
    validateRequest(MenuValidators.toggleFavorite),
    FavoriteController.toggleFavorite
);

/**
 * POST /api/menu/analytics
 * Track menu analytics event
 */
router.post(
    "/analytics",
    requireTenantHeader,
    validateRequest(MenuValidators.trackAnalytics),
    MenuAnalyticsController.trackEvent
);

/////////////////////////////////


//GET /api/menu/:storeUuid
router.get(
  "/:storeUuid",
  requireTenantHeader,
  menuRateLimit,
  menuCacheControl(60), // 60s cache
  MenuController.getMenu
);

//GET /api/menu/products/:productUuid
router.get(
  "/products/:productUuid",
  requireTenantHeader,
  menuRateLimit,
  MenuController.getProduct
);

//POST /api/menu/validate
router.post(
  "/validate",
  requireTenantHeader,
  validateRequest(MenuValidators.validateOrder),
  MenuController.validateOrder
);

//GET /api/menu/search
router.get(
  "/search",
  requireTenantHeader,
  searchRateLimit,
  validateRequest(MenuValidators.searchMenu, "query"),
  MenuController.searchMenu
);

//POST /api/menu/favorites/toggle
router.post(
  "/favorites/toggle",
  authenticate,
  requireTenantHeader,
  validateRequest(MenuValidators.toggleFavorite),
  MenuController.toggleFavorite
);

//GET /api/menu/favorites
router.get( "/favorites", authenticate, requireTenantHeader, MenuController.getFavorites );

export default router;

export default router;