import { getCacheVersion } from "../../cache/cacheVersion.js";
import prisma from "../../config/prisma.ts"
import { MenuPolicyService, MenuService } from "../menu/menu.service.ts";

export class OrderService{
    static async orderService(
        storeUuid: string,
        userUuid: string,
        user: string,
        totalAmount: Number
    ){
        const menu = await MenuService.getStoreMenu(storeUuid);
        const menuVersion = await getCacheVersion(`menu:${storeUuid}`);

        const baseMenu = await MenuService.getStoreMenu(storeUuid);
        const personalized = MenuPolicyService.apply(baseMenu, user);

        await prisma.order.create({
        data: {
            storeUuid,
            userUuid,
            totalAmount,
            menuSnapshot: personalized,
            menuVersion: await getCacheVersion(`menu:${storeUuid}`),
        },
        });
    }
}