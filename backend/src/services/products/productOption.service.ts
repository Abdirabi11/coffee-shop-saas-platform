import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";

export class ProductOptionService{
    static async createProduct(input: {
        tenantUuid: string;
        productUuid: string;
        data: any;
    }){
        const group= await prisma.ProductOptionGroup.create({
            data: {
                tenantUuid: input.tenantUuid,
                productUuid: input.productUuid,
                
                name: input.data.name,
                description: input.data.description,
                
                required: input.data.required || false,
                multiSelect: input.data.multiSelect || false,
                
                minSelections: input.data.minSelections || 0,
                maxSelections: input.data.maxSelections,
                
                displayOrder: input.data.displayOrder || 0,
                displayStyle: input.data.displayStyle || "LIST",
                
                isActive: true,
            }
        })

        EventBus.emit("PRODUCT_OPTION_GROUP_CREATED", {
            tenantUuid: input.tenantUuid,
            productUuid: input.productUuid,
            groupUuid: group.uuid,
        });
      
        return group;
    }

    //List option groups for product
    static async listGroups(input: {
        tenantUuid: string;
        productUuid: string;
    }) {
        return prisma.productOptionGroup.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                productUuid: input.productUuid,
            },
            include: {
                options: {
                    where: { active: true },
                    orderBy: { displayOrder: "asc" },
                },
            },
            orderBy: { displayOrder: "asc" },
        });
    }

    //Update option group
    static async updateGroup(input: {
        tenantUuid: string;
        groupUuid: string;
        data: any;
    }) {
        return prisma.productOptionGroup.update({
            where: {
                uuid: input.groupUuid,
                tenantUuid: input.tenantUuid,
            },
            data: input.data,
        });
    }

    static async deleteGroup(input: {
        tenantUuid: string;
        groupUuid: string;
    }) {
        // Soft delete options first
        await prisma.productOption.updateMany({
            where: {
                optionGroupUuid: input.groupUuid,
                tenantUuid: input.tenantUuid,
            },
            data: { isActive: false },
        });
    
        // Soft delete group
        return prisma.productOptionGroup.update({
            where: {
                uuid: input.groupUuid,
                tenantUuid: input.tenantUuid,
            },
            data: { isActive: false },
        });
    }

    static async createOption(input: {
        tenantUuid: string;
        groupUuid: string;
        data: any;
    }) {
        const option = await prisma.productOption.create({
            data: {
                tenantUuid: input.tenantUuid,
                optionGroupUuid: input.groupUuid,
                
                name: input.data.name,
                description: input.data.description,
                sku: input.data.sku,
                
                extraCost: input.data.extraCost || 0,
                discountedCost: input.data.discountedCost,
                
                displayOrder: input.data.displayOrder || 0,
                imageUrl: input.data.imageUrl,
                
                isDefault: input.data.isDefault || false,
                isActive: true,
                isAvailable: input.data.isAvailable ?? true,
                
                trackStock: input.data.trackStock || false,
                stockQuantity: input.data.stockQuantity,
                lowStockThreshold: input.data.lowStockThreshold,
                
                dailyLimit: input.data.dailyLimit,
                maxPerOrder: input.data.maxPerOrder,
                
                calorieAdjustment: input.data.calorieAdjustment,
            },
        });
    
        return option;
    }
    
    static async updateOption(input: {
        tenantUuid: string;
        optionUuid: string;
        data: any;
    }) {
        return prisma.productOption.update({
            where: {
                uuid: input.optionUuid,
                tenantUuid: input.tenantUuid,
            },
            data: input.data,
        });
    }
    
    static async deleteOption(input: {
        tenantUuid: string;
        optionUuid: string;
    }){
        return prisma.productOption.update({
            where: {
                uuid: input.optionUuid,
                tenantUuid: input.tenantUuid,
            },
            data: { isActive: false },
        });
    }
    
    static async validateSelections(input: {
        productUuid: string;
        selections: Array<{
            groupUuid: string;
            optionUuids: string[];
        }>;
    }): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
    
        // Get all option groups for product
        const groups = await prisma.productOptionGroup.findMany({
            where: {
                productUuid: input.productUuid,
                isActive: true,
            },
            include: {
                options: {
                    where: { active: true },
                },
            },
        });
    
        for (const group of groups) {
            const selection = input.selections.find(s => s.groupUuid === group.uuid);
            const selectedCount = selection?.optionUuids.length || 0;
        
            // Check required
            if (group.required && selectedCount === 0) {
                errors.push(`Option group "${group.name}" is required`);
            };
        
            // Check min selections
            if (group.minSelections && selectedCount < group.minSelections) {
                errors.push(`Option group "${group.name}" requires at least ${group.minSelections} selections`);
            };
    
            // Check max selections
            if (group.maxSelections && selectedCount > group.maxSelections) {
                errors.push(`Option group "${group.name}" allows maximum ${group.maxSelections} selections`);
            };
        
            // Check if selected options exist
            if (selection) {
                for (const optionUuid of selection.optionUuids) {
                    const exists = group.options.find(o => o.uuid === optionUuid);
                    if (!exists) {
                        errors.push(`Invalid option selected in "${group.name}"`);
                    }
                }
            };
        };
    
        return {
            valid: errors.length === 0,
            errors,
        };
    }
}