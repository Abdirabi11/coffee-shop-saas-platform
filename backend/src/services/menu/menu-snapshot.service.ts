import crypto from "crypto";
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import prisma from "../../config/prisma.ts"
import { MenuDiffAnalyticsService } from "./menu-diff.service.ts";

export class MenuSnapshotService{
    static async createSnapshot( 
        storeUuid: string, 
        menu: any, 
        reason= "AUTO",
        triggeredBy?: string
    ){
        const normalizedMenu = {
            ...menu,
            categories: [...menu.categories].sort((a, b) => a.order - b.order),
        };
        
        const menuHash= crypto
          .createHash("sha256")
          .update(JSON.stringify(normalizedMenu))
          .digest("hex")

        const exists= await prisma.MenuSnapshot.findFirst({
            where: { menuHash }
        })
        if (exists) return;

        const version= Number(
            (await getCacheVersion(`menu:${storeUuid}`)) ?? 1
        );

        const lastSnapshot = await prisma.menuSnapshot.findFirst({
            where: { storeUuid },
            orderBy: { createdAt: "desc" },
        });

        const newSnapshot= await prisma.MenuSnapshot.create({
            data: {
                storeUuid,
                menuHash,
                menuJson: normalizedMenu,
                totalCategories: menu.categories.length,
                totalProducts: menu.categories.reduce(
                  (acc, c) => acc + c.products.length,
                  0
                ),
                totalOptions: menu.categories.reduce(
                    (acc, c) =>
                      acc +
                      c.products.reduce((pAcc, p) => pAcc + p.options.length, 0),
                    0
                ),
                version,
                reason,
                triggeredBy
            }
        });

        if (lastSnapshot) {
            await MenuDiffAnalyticsService.record(
              storeUuid,
              lastSnapshot,
              newSnapshot
            );
        }
    }
}