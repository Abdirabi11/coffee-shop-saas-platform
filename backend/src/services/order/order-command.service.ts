import { getCacheVersion } from "../../cache/cacheVersion.ts";
import prisma from "../../config/prisma.ts"
import { OrderEventBus, OrderEventEmitter } from "../../events/order.events.ts";
import { MenuExperimentService } from "../menu/menu-experiment.service.ts";
import { MenuSnapshotService } from "../menu/menu-snapshot.service.ts";
import { MenuPersonalizationService, MenuService } from "../menu/menu.service.ts";
import { InventoryService } from "../products/inventory.service.ts";
import { StoreHoursService } from "../store/storeHours.service.ts";
import { IdempotencyService } from "./idempotency.service.ts";
import { OrderPricingService } from "./order-pricing.service.ts";

interface CreateOrderItemInput {
    productUuid: string;
    quantity: number;
    specialInstructions?: string;
    modifiers?: {
      optionUuid: string;
      quantity?: number;
    }[];
};

interface CreateOrderInput {
    tenantUuid: string;
    storeUuid: string;
    tenantUserUuid: string;
    orderType: OrderType;
    tableNumber?: string;
    deliveryAddress?: any;
    customerNotes?: string;
    promoCode?: string;
    items: CreateOrderItemInput[];
    idempotencyKey?: string;
};

export class OrderCommandService{
    static async createOrder(input: CreateOrderInput){
        const { tenantUuid,
            storeUuid,
            tenantUserUuid,
            orderType,
            items,
            idempotencyKey 
        } = input;

        if (idempotencyKey) {
            const existing = await IdempotencyService.check(
              tenantUuid,
              idempotencyKey,
              "POST /orders"
            );
            if (existing) {
              return JSON.parse(existing.response);
            }
        };

        const isOpen = await StoreHoursService.isStoreOpen(storeUuid);
        if (!isOpen) {
            throw new Error("Store is currently closed");
        }

        const order =await prisma.$transaction(async (tx) => {
            const baseMenu= await MenuService.getStoreMenu(storeUuid);
            const menuSnapshot = await MenuSnapshotService.getCurrentSnapshot( storeUuid );

            // const menuVersion = await getCacheVersion(`menu:${storeUuid}`);
            // const experimentedMenu = MenuExperimentService.apply(personalizedMenu, input.experiment);

            const tenantUser = await tx.tenantUser.findUnique({
                where: { uuid: tenantUserUuid },
                include: { user: true },
            });
            if (!tenantUser) {
                throw new Error("User not found");
            };

            const personalizedMenu = MenuPersonalizationService.apply(
                baseMenu,
                tenantUser
            );

            const pricing = await OrderPricingService.resolveItems(
                tenantUuid,
                storeUuid,
                personalizedMenu,
                items,
                {
                  promoCode: input.promoCode,
                  userTier: tenantUser.role,
                }
            );

            if (pricing.items.length === 0) {
                throw new Error("Order must contain at least one item");
            };

            const orderNumber = await this.generateOrderNumber(tenantUuid, storeUuid);

            const order = await tx.order.create({
                data: {
                  tenantUuid,
                  storeUuid,
                  tenantUserUuid,
                  orderNumber,
                  orderType,
                  tableNumber: input.tableNumber,
                  deliveryAddress: input.deliveryAddress,
                  customerName: tenantUser.displayName ?? tenantUser.user.name,
                  customerPhone: tenantUser.user.phoneNumber,
                  customerNotes: input.customerNotes,
                  status: "PENDING",
                  paymentStatus: "PENDING",
                  fulfillmentStatus: "PENDING",
                  currency: "USD",
                  subtotal: pricing.subtotal,
                  taxAmount: pricing.taxAmount,
                  discountAmount: pricing.discountAmount,
                  serviceCharge: pricing.serviceCharge,
                  totalAmount: pricing.totalAmount,
                  appliedPromos: pricing.appliedPromos,
                  taxBreakdown: pricing.taxBreakdown,
                  menuSnapshotUuid: menuSnapshot?.uuid,
                  menuVersion: menuSnapshot?.version ?? 1,
                  pricingSnapshot: {
                    items: pricing.items,
                    calculations: {
                      subtotal: pricing.subtotal,
                      tax: pricing.taxAmount,
                      discount: pricing.discountAmount,
                      serviceCharge: pricing.serviceCharge,
                      total: pricing.totalAmount,
                    },
                  },
                },
            });

            await tx.orderItem.createMany({
                data: pricing.items.map((item) => ({
                  tenantUuid,
                  orderUuid: order.uuid,
                  productUuid: item.productUuid,
                  productName: item.productName,
                  categoryName: item.categoryName,
                  quantity: item.quantity,
                  basePrice: item.basePrice,
                  optionsCost: item.optionsCost,
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                  discountAmount: item.discountAmount,
                  finalPrice: item.finalPrice,
                  taxAmount: item.taxAmount,
                  selectedOptions: item.selectedOptions,
                  specialInstructions: items.find(i => i.productUuid === item.productUuid)?.specialInstructions,
                  status: "PENDING",
                })),
            });

            await InventoryService.reserve(tx, {
                orderUuid: order.uuid,
                items: pricing.items.map((i) => ({
                  productUuid: i.productUuid,
                  quantity: i.quantity,
                })),
            });

            await tx.orderItem.updateMany({
                where: { orderUuid: order.uuid },
                data: { inventoryReserved: true },
            });

            return order;
            // await PaymentSnapshotService.create(tx, {
            //     orderUuid: order.uuid,
            //     currency: "USD",
            //     subtotal: pricing.subtotal,
            //     tax: pricing.tax,
            //     total: pricing.total,
            //     provider: "STRIPE",
            // });

            // await InventoryService.reserveItems(tx, pricing.items);

            // await InventoryService.reserve(tx, {
            //     orderUuid: order.uuid,
            //     items: payload.items,
            // });

            // await OrderItemService.create(tx, {
            //     orderUuid: order.uuid,
            //     items: payload.items,
            // });

            // await tx.orderItem.createMany({
            //     data: pricing.items.map((item) => ({
            //         orderUuid: order.uuid,
            //         productUuid: item.productUuid,
            //         quantity: item.quantity,
            //         price: item.price,
            //     }))
            // });
            // return order;
        })

        if (idempotencyKey) {
            await IdempotencyService.store(
              tenantUuid,
              idempotencyKey,
              "POST /orders",
              JSON.stringify(order),
              201
            );
        };

        OrderEventBus.emit("ORDER_CREATED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            totalAmount: order.totalAmount,
            items: order.items,
        });
        return order;
    }

    private static async generateOrderNumber(
        tenantUuid: string,
        storeUuid: string
    ){
        const today= new Date().toISOString().split("T")[0].replace(/-/g, "")
        const count= await prisma.order.count({
            where: {
                tenantUuid,
                storeUuid,
                createdAt:{
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                }
            }
        });
        return `ORD-${today}-${String(count + 1).padStart(4, "0")}`;
    }
};