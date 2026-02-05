import prisma from "../../config/prisma.ts"
import { MenuService } from "./menu.service.ts"

export class MenuSnapshotService{
    static async getCurrentSnapshot(storeUuid: string){
        return prisma.menuSnapshot.findFirst({
            where: {
                storeUuid,
                isActive: true
            },
            orderBy: {
                version: "desc"
            }
        })
    }

    static async createSnapshot(
        tenantUuid: string,
        storeUuid: string,
        reason: string
    ){
        const menu= await MenuService.getStoreMenu(storeUuid)
        // Calculate hashes
        const contentHash= this.hashMenu(menu)

        const previous = await this.getCurrentSnapshot(storeUuid);
        const version = (previous?.version ?? 0) + 1;

        return prisma.menuSnapshot.create({
            data: {
              tenantUuid,
              storeUuid,
              version,
              snapshotType: "AUTO_ON_CHANGE",
              reason,
              contentHash,
              categories: menu.categories,
              products: menu.products,
              optionGroups: menu.optionGroups,
              totalCategories: menu.categories.length,
              totalProducts: menu.products.length,
              totalOptionGroups: menu.optionGroups.length,
              isActive: true,
            },
        });
    }

    private static hashMenu(menu: any): string {
        const crypto = require("crypto");
        return crypto
          .createHash("sha256")
          .update(JSON.stringify(menu))
          .digest("hex");
    };
}