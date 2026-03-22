import type { Request, Response } from "express"
import { MenuAnalyticsService } from "../../services/menu/menuAnalytics.service.ts";
import { MenuService } from "../../services/menu/menu.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { FavoriteService } from "../../services/menu/favorite.service.ts";


export class MenuController {
  
    //GET /api/menu/:storeUuid
    static async getMenu(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.tenantUuid!;
            const userUuid = req.user?.uuid;

            const menu = await MenuService.getStoreMenu({
                tenantUuid,
                storeUuid,
                includeUnavailable: false,
                userUuid,
            });

            // Track analytics (async, don't block)
            MenuAnalyticsService.trackMenuView({
                tenantUuid,
                storeUuid,
                userUuid,
                sessionId: req.sessionID,
                deviceType: req.headers["user-agent"]?.includes("Mobile") ? "IOS" : "WEB",
            }).catch(() => {});

            return res.status(200).json({
                success: true,
                menu,
            });

        } catch (error: any) {
            logWithContext("error", "[MenuController] Get menu failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve menu",
            });
        }
    }

    //GET /api/menu/products/:productUuid
    static async getProduct(req: Request, res: Response) {
        try {
            const { productUuid } = req.params;
            const { storeUuid } = req.query;
            const tenantUuid = req.tenantUuid!;
            const userUuid = req.user?.uuid;

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid query parameter is required",
                });
            }

            const product = await MenuService.getProduct({
                tenantUuid,
                storeUuid: storeUuid as string,
                productUuid,
                userUuid,
            });

            // Track analytics (async)
            MenuAnalyticsService.trackProductView({
                tenantUuid,
                storeUuid: storeUuid as string,
                productUuid: product.uuid,
                productName: product.name,
                productPrice: product.basePrice,
                userUuid,
                sessionId: req.sessionID,
            }).catch(() => {});

            return res.status(200).json({
                success: true,
                product,
            });

        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({
                    error: "PRODUCT_NOT_FOUND",
                    message: "Product not found",
                });
            }

            logWithContext("error", "[MenuController] Get product failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve product",
            });
        }
    }

    //POST /api/menu/validate
    static async validateOrder(req: Request, res: Response) {
        try {
            const { productUuid, quantity, selectedOptions, storeUuid } = req.body;
            const tenantUuid = req.tenantUuid!;

            const validation = await MenuService.validateOrder({
                tenantUuid,
                storeUuid,
                productUuid,
                quantity,
                selectedOptions,
            });

            if (!validation.valid) {
                return res.status(400).json({
                success: false,
                ...validation,
                });
            };

            return res.status(200).json({
                success: true,
                ...validation,
            });

        } catch (error: any) {
            logWithContext("error", "[MenuController] Validation failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to validate order",
            });
        }
    }

    //GET /api/menu/search
    static async searchMenu(req: Request, res: Response) {
        try {
            const { query, storeUuid, categoryUuid, maxResults } = req.query;
            const tenantUuid = req.tenantUuid!;

            const results = await MenuService.searchMenu({
                tenantUuid,
                storeUuid: storeUuid as string,
                query: query as string,
                categoryUuid: categoryUuid as string,
                maxResults: maxResults ? parseInt(maxResults as string) : undefined,
            });

            // Track analytics (async)
            MenuAnalyticsService.trackEvent({
                tenantUuid,
                storeUuid: storeUuid as string,
                eventType: "MENU_SEARCH",
                eventCategory: "SEARCH",
                metadata: {
                    query,
                    resultCount: results.count,
                },
                userUuid: req.user?.uuid,
                sessionId: req.sessionID,
            }).catch(() => {});

            return res.status(200).json({
                success: true,
                ...results,
            });

        } catch (error: any) {
            logWithContext("error", "[MenuController] Search failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to search menu",
            });
        }
    }

    //POST /api/menu/favorites/toggle
    static async toggleFavorite(req: Request, res: Response) {
        try {
            const { productUuid, storeUuid } = req.body;
            const tenantUuid = req.tenantUuid!;
            const userUuid = req.user!.uuid;

            const result = await FavoriteService.toggleFavorite({
                tenantUuid,
                userUuid,
                storeUuid,
                productUuid,
            });

            return res.status(200).json({
                success: true,
                ...result,
            });

        } catch (error: any) {
            logWithContext("error", "[MenuController] Toggle favorite failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to toggle favorite",
            });
        }
    }

    //GET /api/menu/favorites
    static async getFavorites(req: Request, res: Response) {
        try {
            const { storeUuid } = req.query;
            const userUuid = req.user!.uuid;

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid query parameter is required",
                });
            }

            const favorites = await FavoriteService.getUserFavorites({
                userUuid,
                storeUuid: storeUuid as string,
            });

            return res.status(200).json({
                success: true,
                favorites,
            });

        } catch (error: any) {
            logWithContext("error", "[MenuController] Get favorites failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve favorites",
            });
        }
    }
}
  