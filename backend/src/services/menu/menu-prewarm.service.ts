import prisma from "../../config/prisma.ts"
import { MenuService } from "./menu.service.ts";

export class MenuPrewarmService{
    static async prewarmStoreMenu (storeUuid: string){
        try {
            await MenuService.getStoreMenu(storeUuid);
            console.log(`[MENU PREWARM] Menu cached for store ${storeUuid}`);
        } catch (err) {
            console.error(
                `[MENU PREWARM ERROR] Failed for store ${storeUuid}`,
                err
            );
        }
    };

    static async prewarmMultipleStores(storeUuids: string[]) {
        for (const storeUuid of storeUuids) {
          await this.prewarmStoreMenu(storeUuid);
        }
    };
};