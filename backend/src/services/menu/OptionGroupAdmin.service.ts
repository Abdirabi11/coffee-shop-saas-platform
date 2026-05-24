import prisma from "../../config/prisma.ts";
import { MenuCacheService } from "./MenuCache.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class OptionGroupAdminService {

    static async createOptionGroup(input: {
        tenantUuid: string;
        storeUuid: string;
        name: string;
        description?: string;
        selectionType: string;
        minSelections?: number;
        maxSelections?: number;
        isRequired?: boolean;
    }) {
        const optionGroup = await prisma.optionGroup.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: input.name,
                description: input.description,
                selectionType: input.selectionType as any,
                minSelections: input.minSelections,
                maxSelections: input.maxSelections,
                isRequired: input.isRequired,
            },
        });

        logWithContext("info", "[OptionGroupAdmin] Created", {
            optionGroupUuid: optionGroup.uuid,
            name: optionGroup.name,
        });

        return optionGroup;
    }

    static async addOption(input: {
        groupUuid: string;
        name: string;
        description?: string;
        extraCost: number;
        trackStock?: boolean;
        stockQuantity?: number;
        triggeredBy: string;
        tenantUuid: string;
    }) {
        const option = await prisma.productOption.create({
            data: {
                tenantUuid: input.tenantUuid,
                optionGroupUuid: input.groupUuid,
                name: input.name,
                description: input.description,
                extraCost: input.extraCost,
                trackStock: input.trackInventory,  
                stockQuantity: input.currentStock,  
            },
        });

        // Invalidate cache for the store this option group belongs to
        const optionGroup = await prisma.optionGroup.findUnique({
            where: { uuid: input.groupUuid },
        });

        if (optionGroup) {
            await MenuCacheService.invalidate({
                tenantUuid: optionGroup.tenantUuid,
                storeUuid: optionGroup.storeUuid,
                reason: "OPTION_ADDED",
                triggeredBy: input.triggeredBy,
            });
        }

        logWithContext("info", "[OptionGroupAdmin] Option added", {
            optionUuid: option.uuid,
            name: option.name,
        });

        return option;
    }

    static async linkToProduct(input: {
        productUuid: string;
        groupUuid: string;
        required?: boolean;
        multiSelect?: boolean;
        displayOrder?: number;
        description?: string;
        triggeredBy: string;
    }) {
        const optionGroup = await prisma.optionGroup.findUniqueOrThrow({
            where: { uuid: input.groupUuid },
        });

        const link = await prisma.productOptionGroup.create({
            data: {
                tenantUuid: optionGroup.tenantUuid,
                productUuid: input.productUuid,
                optionGroupUuid: input.groupUuid,
                name: optionGroup.name,
                required: input.required ?? optionGroup.isRequired,
                multiSelect: input.multiSelect ?? (optionGroup.selectionType === "MULTIPLE"),
                displayOrder: input.displayOrder ?? 0,
                description: input.description ?? optionGroup.description,
            },
        });

        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });

        if (product) {
            await MenuCacheService.invalidate({
                tenantUuid: product.tenantUuid,
                storeUuid: product.storeUuid,
                reason: "PRODUCT_UPDATED",
                triggeredBy: input.triggeredBy,
            });
        }

        logWithContext("info", "[OptionGroupAdmin] Linked to product", {
            productUuid: input.productUuid,
            groupUuid: input.groupUuid,
        });

        return link;
    }

    static async unlinkFromProduct(input: {
        productUuid: string;
        groupUuid: string;
        triggeredBy: string;
    }) {
        const links = await prisma.productOptionGroup.findMany({
            where: {
                productUuid: input.productUuid,
                optionGroupUuid: input.groupUuid,
            },
            select: { uuid: true },
        });

        if (links.length === 0) {
            throw { code: "NOT_FOUND", message: "Link not found" };
        }

        const linkUuids = links.map(l => l.uuid);

        await prisma.productOption.deleteMany({
            where: { optionGroupUuid: { in: linkUuids } },
        });

        await prisma.productOptionGroup.deleteMany({
            where: {
                productUuid: input.productUuid,
                optionGroupUuid: input.groupUuid,
            },
        });

        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });

        if (product) {
            await MenuCacheService.invalidate({
                tenantUuid: product.tenantUuid,
                storeUuid: product.storeUuid,
                reason: "PRODUCT_UPDATED",
                triggeredBy: input.triggeredBy,
            });
        }

        logWithContext("info", "[OptionGroupAdmin] Unlinked from product", {
            productUuid: input.productUuid,
            groupUuid: input.groupUuid,
        });

        return { unlinked: true };
    }
}