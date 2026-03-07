import type { Request, Response } from "express"
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import { MenuCacheService } from "../../services/cache/menuCache.service.ts";
import { InventoryService } from "../../services/inventory/inventory.service.ts";
import { MenuAnalyticsService } from "../../services/menu/menuAnalytics.service.js";
import { MenuFilterService } from "../../services/menu/menu-filter.service.ts";
import { MenuPrewarmService } from "../../services/menu/menu-prewarm.service.ts";
import { MenuPersonalizationService } from "../../services/menu/menu.service.ts";
import { MenuPolicyService } from "../../services/menu/menu.service.ts";
import { MenuService } from "../../services/menu/menu.service.ts";
import { ProductService } from "../../services/products/product.service.ts";
import { ProductOptionService } from "../../services/products/productOption.service.ts";

export const getStoreMenu= async(req: Request, res: Response)=>{
    try {
        const {storeUuid}= req.params;
        if(!storeUuid){
            return res.status(400).json({ message: "storeUuid is required" });
        };

        const baseMenu = await MenuService.getStoreMenu(storeUuid);
        const personalized = MenuPersonalizationService.apply(
            baseMenu,
            req.user
        );
        const filtered = MenuFilterService.apply(personalized, req.query);

        res.json(filtered);
    } catch (err) {
        console.error("[MENU_FETCH_FAILED]", err);
        res.status(500).json({ message: "Failed to load menu" });
    }
};

export const prewarmMenu = async (req: Request, res: Response) => {
    const { storeUuid } = req.params;
  
    await MenuPrewarmService.prewarmStoreMenu(storeUuid);
  
    res.json({ message: "Menu pre-warmed successfully" });
};

export const getPublicMenu = async (req: Request, res: Response) => {
    const { storeUuid } = req.params;
  
    const currentVersion = await getCacheVersion(`menu:${storeUuid}`);
    const clientVersion = req.headers["if-none-match"];
  
    if (clientVersion === currentVersion) {
      return res.status(304).end();
    };

    const baseMenu = await MenuService.getStoreMenu(storeUuid);
    const finalMenu = MenuPolicyService.apply(baseMenu, req.user);

    MenuAnalyticsService.trackMenuView(storeUuid).catch(console.error);

    res.setHeader("ETag", currentVersion);
    res.setHeader("Cache-Control", "public, max-age=60");
  
    res.json(finalMenu);
};

 export class  MenuController {

    //GET /api/public/menu/:storeUuid
    //Get menu for mobile app (NO authentication required)
    static async getMenu(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.headers["x-tenant-id"] as string;

            if (!tenantUuid) {
                return res.status(400).json({
                    error: "TENANT_REQUIRED",
                    message: "x-tenant-id header is required",
                });
            };

            // Get menu from cache
            const menu = await MenuCacheService.getMenu({
                tenantUuid,
                storeUuid,
                checkAvailability: true, // Check current availability
            });

            return res.status(200).json({
                success: true,
                menu,
            });
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve menu",
            });
        }
    }

    //GET /api/public/products/:productUuid
    //Get single product details for mobile app
    static async getProduct(req: Request, res: Response) {
        try {
            const { productUuid } = req.params;
            const tenantUuid = req.headers["x-tenant-id"] as string;
            const storeUuid = req.headers["x-store-id"] as string;

            const product = await ProductService.getByUuid({
                tenantUuid,
                storeUuid,
                productUuid,
                checkAvailability: true,
            });

            if (!product) {
                return res.status(404).json({
                  error: "PRODUCT_NOT_FOUND",
                  message: "Product not found",
                });
            };
        
            // Check stock availability
            const hasStock = await InventoryService.checkStock({
                tenantUuid,
                storeUuid,
                productUuid,
                requestedQuantity: 1,
            });
        
            return res.status(200).json({
                success: true,
                product: {
                  ...product,
                  inStock: hasStock,
                },
            });
        
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve product",
            });
        }
    }

    //POST /api/public/products/validate
    //Validate product + options before adding to cart
    static async validateOrder(req: Request, res: Response) {
        try {
            const { productUuid, quantity, selectedOptions } = req.body;
            const tenantUuid = req.headers["x-tenant-id"] as string;
            const storeUuid = req.headers["x-store-id"] as string;

            // 1. Check product exists and is available
            const product = await ProductService.getByUuid({
                tenantUuid,
                storeUuid,
                productUuid,
                checkAvailability: true,
            });

            if (!product || !product.isActive || !product.isAvailable) {
                return res.status(400).json({
                    error: "PRODUCT_NOT_AVAILABLE",
                    message: "Product is not available",
                });
            };

            // 2. Check stock
            const hasStock = await InventoryService.checkStock({
                tenantUuid,
                storeUuid,
                productUuid,
                requestedQuantity: quantity,
            });

            if (!hasStock) {
                return res.status(400).json({
                    error: "OUT_OF_STOCK",
                    message: "Product is out of stock",
                });
            };

            // 3. Validate option selections
            const validation = await ProductOptionService.validateSelections({
                productUuid,
                selections: selectedOptions,
            });

            if (!validation.valid) {
                return res.status(400).json({
                    error: "INVALID_OPTIONS",
                    message: "Invalid option selections",
                    details: validation.errors,
                });
            };

            // 4. Calculate price
            const basePrice = product.basePrice;
            const optionsCost = selectedOptions.reduce((sum: number, selection: any) => {
                const group = product.optionGroups.find((g: any) => g.uuid === selection.groupUuid);
                const options = group?.options.filter((o: any) => 
                    selection.optionUuids.includes(o.uuid)
                );
                return sum + (options?.reduce((s: number, o: any) => s + o.extraCost, 0) || 0);
            }, 0);

            const totalPrice = (basePrice + optionsCost) * quantity;

            return res.status(200).json({
                success: true,
                valid: true,
                pricing: {
                    basePrice,
                    optionsCost,
                    subtotal: basePrice + optionsCost,
                    quantity,
                    totalPrice,
                },
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to validate order",
            });
        }
    }
}
  