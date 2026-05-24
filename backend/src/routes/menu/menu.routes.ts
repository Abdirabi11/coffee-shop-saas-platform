import express from "express"
import { authenticate,  } from "../../middlewares/auth.middleware.ts";
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

// ─── IP Rate Limit for all public routes
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

// ─── Analytics (public track, admin summary)
router.post(
    "/analytics",
    requireTenantHeader,
    validateRequest(MenuValidators.trackAnalytics),
    MenuAnalyticsController.trackEvent
);
 
export default router;
 