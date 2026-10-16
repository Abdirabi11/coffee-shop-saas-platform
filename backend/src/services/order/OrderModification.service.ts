import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts"
import { InventoryOrderService } from "../inventory/InventoryOrder.service.ts";
import { MenuService } from "../menu/menu.service.ts";
import { OrderPricingService } from "./OrderPricing.service.ts"
import { OrderValidationService } from "./OrderValidation.service.ts";

type Tx = Prisma.TransactionClient;

// Same cap as createOrderSchema
const MAX_ITEM_QUANTITY = 100;

function assertQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
        throw new Error("INVALID_QUANTITY");
    }
}

// Changes to an order before it is paid. Each one runs under a lock on the
// order row and re-checks there that the order can still change; starting a
// payment (PaymentService.startPayment, CashierPaymentService) takes the same
// lock before copying the order total into a Payment. So an order is never
// modified once its amount has been handed to a provider or cashier, and a
// payment never charges a total that was changed under it.
export class OrderModificationService{

    private static async lockModifiableOrder(tx: Tx, tenantUuid: string, orderUuid: string) {
        await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "uuid" = ${orderUuid} AND "tenantUuid" = ${tenantUuid} FOR UPDATE`;

        const order = await tx.order.findFirst({
            where: { uuid: orderUuid, tenantUuid },
            include: { items: true, payments: { select: { uuid: true } } },
        });
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        }

        // There is one Payment row per order; once it exists the amount is fixed
        if (order.paymentStatus !== "PENDING" || order.payments.length > 0) {
            throw new Error("CANNOT_MODIFY_PAID_ORDER");
        }
        if (order.status !== "PENDING") {
            throw new Error(`ORDER_NOT_MODIFIABLE: ${order.status}`);
        }

        return order;
    }

    // Re-total the order from its items as they now stand, with the same
    // pricing as order creation (store tax rate, service charge), and write
    // each item's discount and tax share back
    private static async reprice(tx: Tx, order: { uuid: string; tenantUuid: string; storeUuid: string }) {
        const items = await tx.orderItem.findMany({
            where: { orderUuid: order.uuid },
            orderBy: { createdAt: "asc" },
        });

        const totals = await OrderPricingService.totalsFor(order.tenantUuid, order.storeUuid, items);

        for (const item of items) {
            await tx.orderItem.update({
                where: { uuid: item.uuid },
                data: {
                    discountAmount: item.discountAmount,
                    finalPrice: item.finalPrice,
                    taxAmount: item.taxAmount,
                },
            });
        }

        return tx.order.update({
            where: { uuid: order.uuid },
            data: {
                subtotal: totals.subtotal,
                taxAmount: totals.taxAmount,
                discountAmount: totals.discountAmount,
                serviceCharge: totals.serviceCharge,
                totalAmount: totals.totalAmount,
                appliedPromos: totals.appliedPromos,
                taxBreakdown: totals.taxBreakdown,
                // Same shape createOrder stores, for price disputes
                pricingSnapshot: {
                    items: items.map((item) => ({
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
                    })),
                    calculations: {
                        subtotal: totals.subtotal,
                        tax: totals.taxAmount,
                        discount: totals.discountAmount,
                        serviceCharge: totals.serviceCharge,
                        total: totals.totalAmount,
                    },
                },
            },
            include: { items: true },
        });
    }

    // Product, quantity limits and opening hours, checked as for a new order
    private static async validateItem(
        order: { tenantUuid: string; storeUuid: string; tenantUserUuid: string },
        productUuid: string,
        quantity: number
    ) {
        const validation = await OrderValidationService.validateOrderCreation({
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            tenantUserUuid: order.tenantUserUuid,
            items: [{ productUuid, quantity }],
        });
        if (!validation.valid) {
            throw new Error(`ORDER_VALIDATION_FAILED: ${validation.errors.join("; ")}`);
        }
    }

    //Add item to existing order (before payment)
    static async addItem(input: {
        tenantUuid: string;
        orderUuid: string;
        productUuid: string;
        quantity: number;
        modifiers?: Array<{ optionUuid: string; quantity?: number }>;
        specialInstructions?: string;
    }) {
        assertQuantity(input.quantity);

        // Lookups and pricing run before the transaction, as in createOrder;
        // what can change meanwhile (status, payment) is re-checked under the lock
        const existing = await prisma.order.findFirst({
            where: { uuid: input.orderUuid, tenantUuid: input.tenantUuid },
            select: { tenantUuid: true, storeUuid: true, tenantUserUuid: true },
        });
        if (!existing) {
            throw new Error("ORDER_NOT_FOUND");
        }

        await this.validateItem(existing, input.productUuid, input.quantity);

        const menu = await MenuService.getStoreMenu({
            tenantUuid: existing.tenantUuid,
            storeUuid: existing.storeUuid,
        });

        const pricing = await OrderPricingService.resolveItems(
            existing.tenantUuid,
            existing.storeUuid,
            menu,
            [
                {
                    productUuid: input.productUuid,
                    quantity: input.quantity,
                    modifiers: input.modifiers,
                },
            ]
        );
        const newItem = pricing.items[0];

        const { order, item } = await prisma.$transaction(async (tx) => {
            const order = await this.lockModifiableOrder(tx, input.tenantUuid, input.orderUuid);

            const item = await tx.orderItem.create({
                data: {
                    tenantUuid: order.tenantUuid,
                    orderUuid: order.uuid,
                    productUuid: newItem.productUuid,
                    productName: newItem.productName,
                    categoryName: newItem.categoryName,
                    quantity: newItem.quantity,
                    basePrice: newItem.basePrice,
                    optionsCost: newItem.optionsCost,
                    unitPrice: newItem.unitPrice,
                    subtotal: newItem.subtotal,
                    discountAmount: newItem.discountAmount,
                    finalPrice: newItem.finalPrice,
                    taxAmount: newItem.taxAmount,
                    selectedOptions: newItem.selectedOptions,
                    specialInstructions: input.specialInstructions,
                    status: "PENDING",
                },
            });

            // Fails the whole change with OUT_OF_STOCK if it isn't available
            await InventoryOrderService.reserveForOrder({
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                orderUuid: order.uuid,
                items: [{ productUuid: newItem.productUuid, quantity: newItem.quantity }],
                tx,
            });

            return { order: await this.reprice(tx, order), item };
        });

        EventBus.emit("ORDER_ITEM_ADDED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            orderItemUuid: item.uuid,
            productUuid: item.productUuid,
            quantity: item.quantity,
        });

        return order;
    }

    //Remove item from order (before payment)
    static async removeItem(input: {
        tenantUuid: string;
        orderUuid: string;
        orderItemUuid: string;
    }) {
        const { order, item } = await prisma.$transaction(async (tx) => {
            const order = await this.lockModifiableOrder(tx, input.tenantUuid, input.orderUuid);

            const item = order.items.find((i) => i.uuid === input.orderItemUuid);
            if (!item) {
                throw new Error("ORDER_ITEM_NOT_FOUND");
            }

            // Cannot remove if it's the only item
            if (order.items.length === 1) {
                throw new Error("CANNOT_REMOVE_LAST_ITEM");
            }

            // Return the item's reserved stock before the item goes, so the
            // payment later commits only what is still ordered
            await InventoryOrderService.releaseQuantity({
                orderUuid: order.uuid,
                productUuid: item.productUuid,
                quantity: item.quantity,
                reason: "Item removed from order before payment",
                tx,
            });

            await tx.orderItem.delete({
                where: { uuid: item.uuid },
            });

            return { order: await this.reprice(tx, order), item };
        });

        EventBus.emit("ORDER_ITEM_REMOVED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            orderItemUuid: item.uuid,
            productUuid: item.productUuid,
            quantity: item.quantity,
        });

        return order;
    }

    //Update item quantity (before payment)
    static async updateItemQuantity(input: {
        tenantUuid: string;
        orderUuid: string;
        orderItemUuid: string;
        newQuantity: number;
    }) {
        assertQuantity(input.newQuantity);

        const existing = await prisma.order.findFirst({
            where: { uuid: input.orderUuid, tenantUuid: input.tenantUuid },
            select: {
                tenantUuid: true,
                storeUuid: true,
                tenantUserUuid: true,
                items: { where: { uuid: input.orderItemUuid }, select: { productUuid: true, quantity: true } },
            },
        });
        if (!existing) {
            throw new Error("ORDER_NOT_FOUND");
        }
        const [current] = existing.items;
        if (!current) {
            throw new Error("ORDER_ITEM_NOT_FOUND");
        }

        // More of a product must still be orderable (active, within limits,
        // store open); fewer always is
        if (input.newQuantity > current.quantity) {
            await this.validateItem(existing, current.productUuid, input.newQuantity);
        }

        const { order, item, oldQuantity } = await prisma.$transaction(async (tx) => {
            const order = await this.lockModifiableOrder(tx, input.tenantUuid, input.orderUuid);

            const item = order.items.find((i) => i.uuid === input.orderItemUuid);
            if (!item) {
                throw new Error("ORDER_ITEM_NOT_FOUND");
            }

            const quantityDiff = input.newQuantity - item.quantity;

            if (quantityDiff > 0) {
                await InventoryOrderService.reserveForOrder({
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderUuid: order.uuid,
                    items: [{ productUuid: item.productUuid, quantity: quantityDiff }],
                    tx,
                });
            } else if (quantityDiff < 0) {
                await InventoryOrderService.releaseQuantity({
                    orderUuid: order.uuid,
                    productUuid: item.productUuid,
                    quantity: -quantityDiff,
                    reason: "Item quantity lowered before payment",
                    tx,
                });
            }

            await tx.orderItem.update({
                where: { uuid: item.uuid },
                data: {
                    quantity: input.newQuantity,
                    subtotal: item.unitPrice * input.newQuantity,
                },
            });

            return { order: await this.reprice(tx, order), item, oldQuantity: item.quantity };
        });

        EventBus.emit("ORDER_ITEM_QUANTITY_UPDATED", {
            orderUuid: order.uuid,
            tenantUuid: order.tenantUuid,
            storeUuid: order.storeUuid,
            orderItemUuid: item.uuid,
            oldQuantity,
            newQuantity: input.newQuantity,
        });

        return order;
    }
}
