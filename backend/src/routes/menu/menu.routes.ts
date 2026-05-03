import express from "express"
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";
import { requireTenantHeader } from "../../middlewares/menu/requireTenantHeader.middleware.ts";
import { menuRateLimit, searchRateLimit } from "../../middlewares/menu/rateLimit.middlware.ts";
import { menuCacheControl } from "../../middlewares/menu/cache.controller.ts";
import { MenuController } from "../../controllers/menu/Menu.controller.ts";
import { MenuValidators } from "../../validators/menu.validator.ts";
import { validateRequest } from "../../middlewares/menu/validateRequest.ts";
import { rateLimitByIP } from "../../middlewares/menu/Ratelimitbyip.middleware.ts";
import { FavoriteController } from "../../controllers/menu/Favorite.controller.ts";
import { MenuAnalyticsController } from "../../controllers/menu/Menuanalytics.controller.ts";


const router= express.Router();


router.get(
    "/admin/stores/:storeUuid/menu/preview",
    authenticate,
    authorize("ADMIN", "MANAGER"),
    MenuController.getMenuPreview
);
 
router.post(
    "/stores/:storeUuid/menu/prewarm",
    authenticate,
    authorize("ADMIN"),
    MenuController.prewarmMenu
);
 
// ─── IP Rate Limit for all public routes below 
router.use(rateLimitByIP({ points: 60, duration: 60 }));
 
// ─── Public Menu Routes
router.get(
    "/stores/:storeUuid/menu",
    requireTenantHeader,
    menuRateLimit,
    menuCacheControl(60),
    MenuController.getStoreMenu
);
 
router.get(
    "/:storeUuid",
    requireTenantHeader,
    menuRateLimit,
    menuCacheControl(60),
    MenuController.getMenu
);
 
router.get(
    "/products/:productUuid",
    requireTenantHeader,
    menuRateLimit,
    MenuController.getProduct
);
 
router.get(
    "/search",
    requireTenantHeader,
    searchRateLimit,
    validateRequest(MenuValidators.searchMenu, "query"),
    MenuController.searchMenu
);
 
router.post(
    "/validate",
    requireTenantHeader,
    validateRequest(MenuValidators.validateOrder),
    MenuController.validateOrder
);
 
// ─── Favorites (Auth Required)
router.post(
    "/favorites/toggle",
    authenticate,
    requireTenantHeader,
    validateRequest(MenuValidators.toggleFavorite),
    FavoriteController.toggleFavorite
);
 
router.get(
    "/favorites",
    authenticate,
    requireTenantHeader,
    FavoriteController.getFavorites
);
 
// ─── Analytics
router.post(
    "/analytics",
    requireTenantHeader,
    validateRequest(MenuValidators.trackAnalytics),
    MenuAnalyticsController.trackEvent
);
 
router.get(
    "/analytics/:storeUuid/summary",
    authenticate,
    authorize("ADMIN", "MANAGER"),
    MenuAnalyticsController.getSummary
);
 
export default router;
 