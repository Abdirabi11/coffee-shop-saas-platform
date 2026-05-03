import type { Request, Response } from "express"
import { MenuAnalyticsService } from "../../services/menu/menuAnalytics.service.ts";
import { MenuService } from "../../services/menu/menu.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


export class MenuController {
 
    // GET /menu/stores/:storeUuid/menu — public customer endpoint with ETag
    static async getStoreMenu(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
            const user = (req as any).user;
 
            const menu = await MenuService.getStoreMenu({
                tenantUuid,
                storeUuid,
                includeUnavailable: false,
                userUuid: user?.userUuid,
            });
 
            // ETag support
            const etag = `"menu-${storeUuid}-${Buffer.from(menu.generatedAt).toString("base64").slice(0, 12)}"`;
            if (req.headers["if-none-match"] === etag) {
                return res.status(304).end();
            }
 
            res.set("ETag", etag);
 
            // Track analytics (async, don't block)
            MenuAnalyticsService.trackMenuView({
                tenantUuid,
                storeUuid,
                userUuid: user?.userUuid,
                sessionId: req.headers["x-session-id"] as string,
                deviceType: req.headers["user-agent"]?.includes("Mobile") ? "MOBILE" : "WEB",
            }).catch(() => {});
 
            return res.status(200).json({ success: true, data: menu });
        } catch (error: any) {
            logWithContext("error", "[MenuCtrl] Get store menu failed", { error: error.message });
            return res.status(500).json({ success: false, error: "MENU_FETCH_FAILED" });
        }
    }
 
    // GET /menu/:storeUuid — alias for getStoreMenu
    static async getMenu(req: Request, res: Response) {
        return MenuController.getStoreMenu(req, res);
    }
 
    // GET /admin/stores/:storeUuid/menu/preview — admin sees everything
    static async getMenuPreview(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
 
            const menu = await MenuService.getStoreMenu({
                tenantUuid,
                storeUuid,
                includeUnavailable: true,
            });
 
            return res.status(200).json({ success: true, data: menu });
        } catch (error: any) {
            logWithContext("error", "[MenuCtrl] Preview failed", { error: error.message });
            return res.status(500).json({ success: false, error: "PREVIEW_FAILED" });
        }
    }
 
    // POST /stores/:storeUuid/menu/prewarm — admin triggers cache warm
    static async prewarmMenu(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
 
            await MenuService.getStoreMenu({ tenantUuid, storeUuid, includeUnavailable: false });
            await MenuService.getStoreMenu({ tenantUuid, storeUuid, includeUnavailable: true });
 
            return res.status(200).json({ success: true, message: "Menu cache warmed" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "PREWARM_FAILED" });
        }
    }
 
    // GET /menu/products/:productUuid?storeUuid=xxx
    static async getProduct(req: Request, res: Response) {
        try {
            const { productUuid } = req.params;
            const storeUuid = req.query.storeUuid as string;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
            const user = (req as any).user;
 
            if (!storeUuid) {
                return res.status(400).json({ success: false, error: "STORE_UUID_REQUIRED" });
            }
 
            const product = await MenuService.getProduct({
                tenantUuid,
                storeUuid,
                productUuid,
                userUuid: user?.userUuid,
            });
 
            // Track view (async)
            MenuAnalyticsService.trackProductView({
                tenantUuid,
                storeUuid,
                productUuid: product.uuid,
                productName: product.name,
                productPrice: product.basePrice,
                userUuid: user?.userUuid,
                sessionId: req.headers["x-session-id"] as string,
            }).catch(() => {});
 
            return res.status(200).json({ success: true, data: product });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({ success: false, error: "PRODUCT_NOT_FOUND" });
            }
            logWithContext("error", "[MenuCtrl] Get product failed", { error: error.message });
            return res.status(500).json({ success: false, error: "PRODUCT_FETCH_FAILED" });
        }
    }
 
    // POST /menu/validate
    static async validateOrder(req: Request, res: Response) {
        try {
            const { productUuid, quantity, selectedOptions, storeUuid } = req.body;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
 
            const validation = await MenuService.validateOrder({
                tenantUuid,
                storeUuid,
                productUuid,
                quantity,
                selectedOptions,
            });
 
            if (!validation.valid) {
                return res.status(400).json({ success: false, ...validation });
            }
 
            return res.status(200).json({ success: true, ...validation });
        } catch (error: any) {
            logWithContext("error", "[MenuCtrl] Validate failed", { error: error.message });
            return res.status(500).json({ success: false, error: "VALIDATION_FAILED" });
        }
    }
 
    // GET /menu/search?query=latte&storeUuid=xxx
    static async searchMenu(req: Request, res: Response) {
        try {
            const { query, storeUuid, categoryUuid, maxResults } = req.query;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
            const user = (req as any).user;
 
            if (!query || !storeUuid) {
                return res.status(400).json({ success: false, error: "QUERY_AND_STORE_REQUIRED" });
            }
 
            const results = await MenuService.searchMenu({
                tenantUuid,
                storeUuid: storeUuid as string,
                query: query as string,
                categoryUuid: categoryUuid as string,
                maxResults: maxResults ? parseInt(maxResults as string) : undefined,
            });
 
            // Track search (async)
            MenuAnalyticsService.trackEvent({
                tenantUuid,
                storeUuid: storeUuid as string,
                eventType: "MENU_SEARCH",
                eventCategory: "SEARCH",
                metadata: { query, resultCount: results.count },
                userUuid: user?.userUuid,
                sessionId: req.headers["x-session-id"] as string,
            }).catch(() => {});
 
            return res.status(200).json({ success: true, ...results });
        } catch (error: any) {
            logWithContext("error", "[MenuCtrl] Search failed", { error: error.message });
            return res.status(500).json({ success: false, error: "SEARCH_FAILED" });
        }
    }
}
  