import express from "express";
import { getMenuPreview } from "../../controllers/menu/menu-preview.controller.ts";
import { getStoreMenu, prewarmMenu } from "../../controllers/menu/menu.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { validateRequest } from "../../validators/menu.validator.js";

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

export default router;