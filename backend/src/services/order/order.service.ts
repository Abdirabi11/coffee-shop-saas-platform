import { text } from "node:stream/consumers";
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import prisma from "../../config/prisma.ts"
import { MenuExperimentService } from "../menu/menu-experiment.service.ts";
import { MenuPolicyService, MenuService, MenuPersonalizationService } from "../menu/menu.service.ts";
import { OrderPricingService } from "./order-pricing.service.ts";

interface CreateOrderItemInput {
    productUuid: string;
    quantity: number;
    modifiers?: {
      optionUuid: string;
      quantity?: number;
    }[];
};

interface CreateOrderInput {
    storeUuid: string;
    user: {
      uuid: string;
      tier?: string;
    };
    experiment?: {
      name: string;
      variant: string;
    };
    items: CreateOrderItemInput[];
};

export class OrderService{
    static async createOrder(input: CreateOrderInput){
        const { storeUuid, user, experiment, items } = input;

        const baseMenu = await MenuService.getStoreMenu(storeUuid);
        const menuVersion = await getCacheVersion(`menu:${storeUuid}`);

        const personalizedMenu = MenuPersonalizationService.apply(
            baseMenu,
            user
        );

        const experimentedMenu = MenuExperimentService.apply(
            personalizedMenu,
            experiment
        );

        const pricingResult = OrderPricingService.resolveItems(experimentedMenu, items);

        const menuSnapshot= experimentedMenu

        // const orderItems = OrderPricingService.resolveItems(
        //     experimentedMenu,
        //     items
        // );

        const order = await prisma.$transaction(async (tx) => {
            const  createdOrder= await prisma.order.create({
                data: {
                storeUuid,
                userUuid: user?.uuid,
                totalAmount: pricingResult.total,
                menuSnapshot,
                menuVersion
                },
            });

            await tx.orderItem.createMany({
                data: pricingResult.items.map((item) => ({
                    orderUuid: createdOrder.uuid,
                    productUuid: item.productUuid,
                    quantity: item.quantity,
                    price: item.price,
                })),
            });
            return createdOrder;
        })
        return order;
    };

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