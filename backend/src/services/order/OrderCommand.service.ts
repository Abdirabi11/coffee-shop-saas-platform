import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { MenuService } from "../menu/menu.service.ts";
import { MenuSnapshotService } from "../menu/menuSnapshot.service.ts";
import { StoreHoursService } from "../store/StoreHours.service.ts";
import { IdempotencyService } from "./Idempotency.service.ts";
import { OrderPricingService } from "./OrderPricing.service.ts";
import { OrderNumberService } from "./OrderNumber.service.ts";

const ORDER_ROUTE = "POST /orders";

interface CreateOrderItemInput {
  productUuid: string;
  quantity: number;
  specialInstructions?: string;
  modifiers?: {
    optionUuid: string;
    quantity?: number;
  }[];
}
 
interface CreateOrderInput {
  tenantUuid: string;
  storeUuid: string;
  tenantUserUuid: string;
  orderType: string;
  tableNumber?: string;
  deliveryAddress?: any;
  customerNotes?: string;
  promoCode?: string;
  items: CreateOrderItemInput[];
  idempotencyKey?: string;
}
 
export class OrderCommandService {
 
    static async createOrder(input: CreateOrderInput) {
        const {
            tenantUuid,
            storeUuid,
            tenantUserUuid,
            orderType,
            items,
            idempotencyKey,
        } = input;
    
        // Everything that defines the order, including who placed it: the
        // key is only unique per tenant, so another customer reusing it must
        // get a mismatch, not this customer's order.
        const requestHash = IdempotencyService.hashRequest({
            storeUuid,
            tenantUserUuid,
            orderType,
            tableNumber: input.tableNumber,
            deliveryAddress: input.deliveryAddress,
            customerNotes: input.customerNotes,
            promoCode: input.promoCode,
            items,
        });

        if (idempotencyKey) {
            const existing = await IdempotencyService.check(
                tenantUuid,
                idempotencyKey,
                ORDER_ROUTE,
                requestHash
            );
            if (existing) {
                return JSON.parse(existing.response);
            }
        }
    
        const isOpen = await StoreHoursService.isStoreOpen(storeUuid);
        if (!isOpen) {
            throw new Error("STORE_CLOSED");
        };

        // Read-only lookups and pricing run before the transaction (none of
        // them use it), keeping it short: a concurrent retry with the same
        // idempotency key waits on it.
        const tenantUser = await prisma.tenantUser.findUnique({
            where: { uuid: tenantUserUuid },
            include: { user: true },
        });
        if (!tenantUser) throw new Error("USER_NOT_FOUND");

        const menu = await MenuService.getStoreMenu({
            tenantUuid,
            storeUuid,
            userUuid: tenantUser.user.uuid,
        });

        // Get menu snapshot for price dispute protection
        const menuSnapshot = await MenuSnapshotService.getCurrentSnapshot(storeUuid);

        const pricing = await OrderPricingService.resolveItems(
            tenantUuid,
            storeUuid,
            menu,
            items,
            {
                promoCode: input.promoCode,
                userTier: tenantUser.role,
            }
        );

        if (pricing.items.length === 0) {
            throw new Error("ORDER_EMPTY");
        }

        let order;
        try {
            order = await prisma.$transaction(async (tx) => {

                // Claim the key first. A concurrent request with the same key
                // blocks on this insert until we finish: if we commit it gets a
                // unique violation and replays our order below; if we roll back
                // (e.g. OUT_OF_STOCK) the claim goes with us and it proceeds.
                if (idempotencyKey) {
                    await IdempotencyService.claim(tx, tenantUuid, idempotencyKey, ORDER_ROUTE, requestHash);
                }
    
                // Generate order number: ORD-20260328-0001 (locked inside this tx)
                const orderNumber = await OrderNumberService.next(tx, tenantUuid);
        
                // Create order
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
        
                // Create order items
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
                        specialInstructions: items.find(
                            (i) => i.productUuid === item.productUuid
                        )?.specialInstructions,
                        status: "PENDING",
                    })),
                });
        
                // Reserve inventory (availableStock↓, reservedStock↑)
                // Same transaction as the order: the reservation commits or
                // rolls back with it, and can see the order items created above
                await InventoryOrderService.reserveForOrder({
                    tenantUuid,
                    storeUuid,
                    orderUuid: order.uuid,
                    items: pricing.items.map((i) => ({
                        productUuid: i.productUuid,
                        quantity: i.quantity,
                    })),
                    tx,
                });

                // Same transaction as the order, so a committed key always has
                // the order to replay
                if (idempotencyKey) {
                    await IdempotencyService.complete(tx, tenantUuid, idempotencyKey, ORDER_ROUTE, order, 201);
                }
        
                return order;
            });
        } catch (error) {
            // Lost the claim race: the winner committed, so replay its order
            if (idempotencyKey && IdempotencyService.isClaimConflict(error)) {
                const existing = await IdempotencyService.check(tenantUuid, idempotencyKey, ORDER_ROUTE, requestHash);
                if (existing) {
                    MetricsService.increment("order.idempotent_replay", 1);
                    return JSON.parse(existing.response);
                }
            }
            throw error;
        }
    
        EventBus.emit("ORDER_CREATED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            totalAmount: order.totalAmount,
        });
    
        logWithContext("info", "[Order] Created", {
            orderUuid: order.uuid,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
        });
    
        MetricsService.increment("order.created", 1);
    
        return order;
    }
}