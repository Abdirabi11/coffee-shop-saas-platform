import prisma from "../../config/prisma.ts"
import { InventoryService } from "../inventory/inventory.service.ts";
import { ProductOptionService } from "../products/productOption.service.ts";
import { StoreHoursService } from "../store/storeHours.service.ts";

export class OrderValidationService{
    //Validate order before creation
    static async validateOrderCreation(input: {
        tenantUuid: string;
        storeUuid: string;
        tenantUserUuid: string;
        items: Array<{
            productUuid: string;
            quantity: number;
        }>;
    } ){
        const errors: string[] = [];

        // 1. Check store is open
        const isOpen = await StoreHoursService.isStoreOpen(input.storeUuid);
        if (!isOpen) {
            errors.push("Store is currently closed");
        }

        // 2. Check user exists
        const user = await prisma.tenantUser.findUnique({
            where: { uuid: input.tenantUserUuid },
        });
        if (!user) {
            errors.push("User not found");
        };

        // 3. Check items exist and are available
        for (const item of input.items) {
            const product = await prisma.product.findFirst({
                where: {
                    uuid: item.productUuid,
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    isActive: true,
                    isDeleted: false,
                },
            });
    
            if (!product) {
                errors.push(`Product ${item.productUuid} not found or unavailable`);
                continue;
            }
    
            // Check stock
            if (product.trackInventory) {
                const hasStock = await InventoryService.checkStock({
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    productUuid: item.productUuid,
                    requestedQuantity: item.quantity,
                });
        
                if (!hasStock) {
                    errors.push(`${product.name} is out of stock`);
                }
            };
    
            // Check quantity limits
            if (item.quantity < product.minOrderQuantity) {
                errors.push(
                    `${product.name} minimum order quantity is ${product.minOrderQuantity}`
                );
            };
    
            if (product.maxOrderQuantity && item.quantity > product.maxOrderQuantity) {
                errors.push(
                    `${product.name} maximum order quantity is ${product.maxOrderQuantity}`
                );
            };
    
            // Check daily limit
            if (product.dailyLimit) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
        
                const soldToday = await prisma.orderItem.aggregate({
                    where: {
                        productUuid: item.productUuid,
                        order: {
                            storeUuid: input.storeUuid,
                            status: "COMPLETED",
                            createdAt: { gte: today },
                        },
                    },
                    _sum: { quantity: true },
                });
        
                const remaining =
                    product.dailyLimit - (soldToday._sum.quantity || 0);
        
                if (item.quantity > remaining) {
                    errors.push(
                        `${product.name} has only ${remaining} left for today (daily limit: ${product.dailyLimit})`
                    );
                }
            };
        }
  
        // 4. Check for duplicate items
        const productUuids = input.items.map((i) => i.productUuid);
        const uniqueUuids = new Set(productUuids);
        if (productUuids.length !== uniqueUuids.size) {
            errors.push("Duplicate items found - please combine quantities");
        }
    
        return {
            valid: errors.length === 0,
            errors,
        };
    }

    //Validate product options selections
    static async validateOptions(input: {
        productUuid: string;
        modifiers: Array<{ optionUuid: string; quantity?: number }>;
    }) {
        // Use ProductOptionService.validateSelections
        const validation = await ProductOptionService.validateSelections({
            productUuid: input.productUuid,
            selections: [
                {
                    groupUuid: "", // Would need to map options to groups
                    optionUuids: input.modifiers.map((m) => m.optionUuid),
                },
            ],
        });

        return validation;
    }
}
