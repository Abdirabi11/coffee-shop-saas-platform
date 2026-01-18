import { getCacheVersion } from "../../cache/cacheVersion.ts";
import prisma from "../../config/prisma.ts"
import { OrderEventBus, OrderEventEmitter } from "../../events/order.events.js";
import { MenuExperimentService } from "../menu/menu-experiment.service.js";
import { MenuPersonalizationService, MenuService } from "../menu/menu.service.ts";
import { InventoryService } from "../products/inventory.service.ts";
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

export class OrderCommandService{
    static async createOrder(input: CreateOrderInput){
        const { storeUuid, user, experiment, items } = input;

        const order =await prisma.$transaction(async (tx) => {
            const baseMenu= await MenuService.getStoreMenu(input.storeUuid);
            const menuVersion = await getCacheVersion(`menu:${storeUuid}`);
            const personalizedMenu=  MenuPersonalizationService.apply(baseMenu, input.user);
            const experimentedMenu = MenuExperimentService.apply(personalizedMenu, input.experiment);
            const pricing = OrderPricingService.resolveItems(experimentedMenu, input.items);

            // const inventoryResult = await InventoryService.reserveItems(tx, pricingResult.items);

            const order= await tx.order.create({
                data: {
                  storeUuid,
                  userUuid: user.uuid,
                  status: "PAYMENT_PENDING",
                  subtotal: pricing.subtotal,
                  tax: pricing.tax,
                  totalAmount: pricing.total,
                  menuSnapshot: experimentedMenu,
                  menuVersion,
                }
            });

            await PaymentSnapshotService.create(tx, {
                orderUuid: order.uuid,
                currency: "USD",
                subtotal: pricing.subtotal,
                tax: pricing.tax,
                total: pricing.total,
                provider: "STRIPE",
            });

            await InventoryService.reserveItems(tx, pricing.items);

            // await InventoryService.reserve(tx, {
            //     orderUuid: order.uuid,
            //     items: payload.items,
            // });

            // await OrderItemService.create(tx, {
            //     orderUuid: order.uuid,
            //     items: payload.items,
            // });

            await tx.orderItem.createMany({
                data: pricing.items.map((item) => ({
                    orderUuid: order.uuid,
                    productUuid: item.productUuid,
                    quantity: item.quantity,
                    price: item.price,
                }))
            });
            return order;
        })

        OrderEventBus.emit("ORDER_CREATED", {
            orderUuid: order.uuid,
            storeUuid: order.storeUuid,
            total: order.totalAmount,
        });

        return order;
    }
};