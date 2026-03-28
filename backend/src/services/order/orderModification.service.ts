import prisma from "../../config/prisma.js"
import { EventBus } from "../../events/eventBus.js"
import { InventoryService } from "../inventory/inventory.service.js";
import { MenuService } from "../menu/menu.service.js";
import { OrderPricingService } from "./order-pricing.service.ts";


export class OrderModificationService{
    //Add item to existing order (before payment)
    static async addItem(input: {
        tenantUuid: string;
        orderUuid: string;
        productUuid: string;
        quantity: number;
        modifiers?: Array<{ optionUuid: string; quantity?: number }>;
        specialInstructions?: string;
    }) {
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                items: true,
            },
        });
    
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        }
 
        // Can only modify if order is not yet paid
        if (order.paymentStatus !== "PENDING") {
            throw new Error("CANNOT_MODIFY_PAID_ORDER");
        }
    
        // Get menu
        const menu = await MenuService.getStoreMenu(order.storeUuid);
    
        // Price the new item
        const pricing = await OrderPricingService.resolveItems(
            order.tenantUuid,
            order.storeUuid,
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
 
        await prisma.$transaction(async (tx) => {
            // Add new item
            await tx.orderItem.create({
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
        
            // Reserve inventory for new item
            await InventoryService.reserveStock({
                tenantUuid: order.tenantUuid,
                storeUuid: order.storeUuid,
                orderUuid: order.uuid,
                items: [
                    {
                        productUuid: newItem.productUuid,
                        quantity: newItem.quantity,
                    },
                ],
                tx,
            });
    
            // Recalculate order total
            const newSubtotal = order.subtotal + newItem.subtotal;
            const newTax = Math.round(newSubtotal * 0.1); // Simplified
            const newTotal = newSubtotal + newTax;
        
            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                    subtotal: newSubtotal,
                    taxAmount: newTax,
                    totalAmount: newTotal,
                },
            });
        });
 
        EventBus.emit("ORDER_ITEM_ADDED", {
            orderUuid: order.uuid,
            productUuid: newItem.productUuid,
            quantity: newItem.quantity,
        });
    
        return order;
    }  

    //Remove item from order (before payment)
    static async removeItem(input: {
        tenantUuid: string;
        orderUuid: string;
        orderItemUuid: string;
    }) {
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                items: true,
            },
        });

        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };

        if (order.paymentStatus !== "PENDING") {
            throw new Error("CANNOT_MODIFY_PAID_ORDER");
        }

        const item = order.items.find((i) => i.uuid === input.orderItemUuid);
        if (!item) {
            throw new Error("ORDER_ITEM_NOT_FOUND");
        }

        // Cannot remove if it's the only item
        if (order.items.length === 1) {
            throw new Error("CANNOT_REMOVE_LAST_ITEM");
        }

        await prisma.$transaction(async (tx) => {
            // Delete item
            await tx.orderItem.delete({
                where: { uuid: item.uuid },
            });

            // Release inventory for removed item
            // Note: This requires finding the specific reservation for this item
            // Simplified here - in production, track item-level reservations

            // Recalculate order total
            const newSubtotal = order.subtotal - item.subtotal;
            const newTax = Math.round(newSubtotal * 0.1);
            const newTotal = newSubtotal + newTax;

            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                    subtotal: newSubtotal,
                    taxAmount: newTax,
                    totalAmount: newTotal,
                },
            });
        });

        EventBus.emit("ORDER_ITEM_REMOVED", {
            orderUuid: order.uuid,
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
        if (input.newQuantity <= 0) {
            throw new Error("QUANTITY_MUST_BE_POSITIVE");
        }
      
        const order = await prisma.order.findFirst({
            where: {
                uuid: input.orderUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                items: true,
            },
        });
      
        if (!order) {
            throw new Error("ORDER_NOT_FOUND");
        };
      
        if (order.paymentStatus !== "PENDING") {
            throw new Error("CANNOT_MODIFY_PAID_ORDER");
        };
      
        const item = order.items.find((i) => i.uuid === input.orderItemUuid);
        if (!item) {
            throw new Error("ORDER_ITEM_NOT_FOUND");
        };
      
        const quantityDiff = input.newQuantity - item.quantity;
      
        await prisma.$transaction(async (tx) => {
            // Update item
            const newSubtotal = item.unitPrice * input.newQuantity;
            const newFinalPrice = newSubtotal - item.discountAmount;
      
            await tx.orderItem.update({
                where: { uuid: item.uuid },
                data: {
                    quantity: input.newQuantity,
                    subtotal: newSubtotal,
                    finalPrice: newFinalPrice,
                },
            });
      
            // Adjust inventory reservation
            if (quantityDiff > 0) {
                // Need more stock
                await InventoryService.reserveStock({
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    orderUuid: order.uuid,
                    items: [
                        {
                            productUuid: item.productUuid,
                            quantity: quantityDiff,
                        },
                    ],
                    tx,
                });
            } else if (quantityDiff < 0) {
              // Release excess stock
              // Simplified - in production, track specific reservations
            }
      
            // Recalculate order total
            const subtotalDiff = item.unitPrice * quantityDiff;
            const newSubtotal = order.subtotal + subtotalDiff;
            const newTax = Math.round(newSubtotal * 0.1);
            const newTotal = newSubtotal + newTax;
      
            await tx.order.update({
                where: { uuid: order.uuid },
                data: {
                    subtotal: newSubtotal,
                    taxAmount: newTax,
                    totalAmount: newTotal,
                },
            });
        });
      
        EventBus.emit("ORDER_ITEM_QUANTITY_UPDATED", {
            orderUuid: order.uuid,
            orderItemUuid: item.uuid,
            oldQuantity: item.quantity,
            newQuantity: input.newQuantity,
        });
      
        return order;
    }
}