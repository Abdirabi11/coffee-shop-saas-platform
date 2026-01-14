import type { Request, Response } from "express"
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import { MenuAnalyticsService } from "../../services/menu/menu-analytics.service.ts";
import { MenuPrewarmService } from "../../services/menu/menu-prewarm.service.ts";
import { MenuPersonalizationService } from "../../services/menu/menu.service.ts";
import { MenuPolicyService } from "../../services/menu/menu.service.ts";
import { MenuService } from "../../services/menu/menu.service.ts";

export const getStoreMenu= async(req: Request, res: Response)=>{
    try {
        const {storeUuid}= req.params;
        if(!storeUuid){
            return res.status(400).json({ message: "storeUuid is required" });
        };

        const menu = await MenuService.getStoreMenu(storeUuid);

        const finalMenu = MenuPersonalizationService.apply(
            menu,
            req.user
        );
        res.json(finalMenu);
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
  