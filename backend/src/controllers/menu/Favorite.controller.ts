import type { Request, Response } from "express";
import { FavoriteService } from "../../services/menu/favorite.service.ts";

export class FavoriteController {
 
    static async toggleFavorite(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
 
            const { storeUuid, productUuid } = req.body;
            const tenantUuid = req.headers["x-tenant-uuid"] as string;
 
            if (!storeUuid || !productUuid) {
                return res.status(400).json({ success: false, error: "STORE_AND_PRODUCT_REQUIRED" });
            }
 
            const result = await FavoriteService.toggleFavorite({
                tenantUuid,
                userUuid: user.userUuid,
                storeUuid,
                productUuid,
            });
 
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
 
    static async getFavorites(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
 
            const storeUuid = req.query.storeUuid as string;
            if (!storeUuid) {
                return res.status(400).json({ success: false, error: "STORE_UUID_REQUIRED" });
            }
 
            const favorites = await FavoriteService.getUserFavorites({
                userUuid: user.userUuid,
                storeUuid,
            });
 
            return res.status(200).json({ success: true, data: favorites });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}