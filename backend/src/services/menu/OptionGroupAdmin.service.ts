import prisma from "../../config/prisma.ts";
import { MenuCacheService } from "./menuCache.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Option groups and products are looked up within the caller's verified
// tenant, and a group can only be linked to a product of the same store.
export class OptionGroupAdminService {

    private static async findGroup(tenantUuid: string, groupUuid: string) {
        const group = await prisma.optionGroup.findFirst({ where: { uuid: groupUuid, tenantUuid } });
        if (!group) throw new Error("OPTION_GROUP_NOT_FOUND");
        return group;
    }

    private static async findProduct(tenantUuid: string, productUuid: string) {
        const product = await prisma.product.findFirst({ where: { uuid: productUuid, tenantUuid } });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        return product;
    }

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

    // Options of a group live in the Option model: it's what the menu
    // (MenuService) and order pricing read
    static async addOption(input: {
        groupUuid: string;
        name: string;
        description?: string | null;
        extraCost?: number;
        order?: number;
        isAvailable?: boolean;
        trackInventory?: boolean;
        currentStock?: number;
        triggeredBy: string;
        tenantUuid: string;
    }) {
        const group = await this.findGroup(input.tenantUuid, input.groupUuid);

        const option = await prisma.option.create({
            data: {
                optionGroupUuid: group.uuid,
                name: input.name,
                description: input.description ?? undefined,
                extraCost: input.extraCost ?? 0,
                order: input.order ?? 0,
                isAvailable: input.isAvailable ?? true,
                trackInventory: input.trackInventory ?? false,
                currentStock: input.currentStock,
            },
        });

        await this.invalidate(group, "OPTION_ADDED", input.triggeredBy);
        logWithContext("info", "[OptionGroupAdmin] Option added", {
            optionUuid: option.uuid,
            groupUuid: group.uuid,
        });
        return option;
    }

    // Groups of a store with their options; inactive ones included, so the
    // admin can turn them back on
    static async listOptionGroups(tenantUuid: string, storeUuid: string) {
        return prisma.optionGroup.findMany({
            where: { tenantUuid, storeUuid },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            include: {
                options: { orderBy: [{ order: "asc" }, { name: "asc" }] },
                _count: { select: { productLinks: true } },
            },
        });
    }

    static async updateOptionGroup(input: {
        tenantUuid: string;
        groupUuid: string;
        triggeredBy: string;
        data: {
            name?: string;
            description?: string | null;
            selectionType?: "SINGLE" | "MULTIPLE" | "QUANTITY";
            minSelections?: number;
            maxSelections?: number | null;
            isRequired?: boolean;
            order?: number;
            isActive?: boolean;
        };
    }) {
        const group = await this.findGroup(input.tenantUuid, input.groupUuid);

        // Check the selection range as it will be after the update
        const min = input.data.minSelections ?? group.minSelections;
        const max = input.data.maxSelections !== undefined ? input.data.maxSelections : group.maxSelections;
        if (max !== null && min > max) throw new Error("INVALID_SELECTION_RANGE");

        const updated = await prisma.optionGroup.update({
            where: { uuid: group.uuid },
            data: input.data,
        });

        await this.invalidate(group, "OPTION_GROUP_UPDATED", input.triggeredBy);
        logWithContext("info", "[OptionGroupAdmin] Option group updated", {
            groupUuid: group.uuid,
            changes: Object.keys(input.data),
        });
        return updated;
    }

    // Soft delete: past orders still point at the group's options, so the
    // group and its options are deactivated (hidden from the menu, refused at
    // checkout) rather than removed. PATCH isActive: true restores it.
    static async deleteOptionGroup(input: { tenantUuid: string; groupUuid: string; triggeredBy: string }) {
        const group = await this.findGroup(input.tenantUuid, input.groupUuid);

        await prisma.$transaction([
            prisma.optionGroup.update({ where: { uuid: group.uuid }, data: { isActive: false } }),
            prisma.option.updateMany({ where: { optionGroupUuid: group.uuid }, data: { isActive: false } }),
        ]);

        await this.invalidate(group, "OPTION_GROUP_DELETED", input.triggeredBy);
        logWithContext("info", "[OptionGroupAdmin] Option group deactivated", { groupUuid: group.uuid });
        return { deleted: true };
    }

    private static async findOption(tenantUuid: string, optionUuid: string) {
        const option = await prisma.option.findFirst({
            where: { uuid: optionUuid, optionGroup: { tenantUuid } },
            include: { optionGroup: { select: { uuid: true, tenantUuid: true, storeUuid: true } } },
        });
        if (!option) throw new Error("OPTION_NOT_FOUND");
        return option;
    }

    static async updateOption(input: {
        tenantUuid: string;
        optionUuid: string;
        triggeredBy: string;
        data: {
            name?: string;
            description?: string | null;
            extraCost?: number;
            order?: number;
            isActive?: boolean;
            isAvailable?: boolean;
            trackInventory?: boolean;
            currentStock?: number | null;
        };
    }) {
        const option = await this.findOption(input.tenantUuid, input.optionUuid);
        const updated = await prisma.option.update({ where: { uuid: option.uuid }, data: input.data });

        await this.invalidate(option.optionGroup, "OPTION_UPDATED", input.triggeredBy);
        logWithContext("info", "[OptionGroupAdmin] Option updated", {
            optionUuid: option.uuid,
            changes: Object.keys(input.data),
        });
        return updated;
    }

    // Soft delete, as for groups: order items keep referencing the option
    static async deleteOption(input: { tenantUuid: string; optionUuid: string; triggeredBy: string }) {
        const option = await this.findOption(input.tenantUuid, input.optionUuid);
        await prisma.option.update({ where: { uuid: option.uuid }, data: { isActive: false } });

        await this.invalidate(option.optionGroup, "OPTION_DELETED", input.triggeredBy);
        logWithContext("info", "[OptionGroupAdmin] Option deactivated", { optionUuid: option.uuid });
        return { deleted: true };
    }

    private static async invalidate(
        group: { tenantUuid: string; storeUuid: string },
        reason: string,
        triggeredBy: string
    ) {
        await MenuCacheService.invalidate({
            tenantUuid: group.tenantUuid,
            storeUuid: group.storeUuid,
            reason,
            triggeredBy,
        });
    }

    static async linkToProduct(input: {
        tenantUuid: string;
        productUuid: string;
        groupUuid: string;
        required?: boolean;
        multiSelect?: boolean;
        displayOrder?: number;
        description?: string;
        triggeredBy: string;
    }) {
        const product = await this.findProduct(input.tenantUuid, input.productUuid);
        const optionGroup = await this.findGroup(input.tenantUuid, input.groupUuid);
        if (optionGroup.storeUuid !== product.storeUuid) {
            throw new Error("OPTION_GROUP_STORE_MISMATCH");
        }

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

        await MenuCacheService.invalidate({
            tenantUuid: product.tenantUuid,
            storeUuid: product.storeUuid,
            reason: "PRODUCT_UPDATED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[OptionGroupAdmin] Linked to product", {
            productUuid: input.productUuid,
            groupUuid: input.groupUuid,
        });

        return link;
    }

    static async unlinkFromProduct(input: {
        tenantUuid: string;
        productUuid: string;
        groupUuid: string;
        triggeredBy: string;
    }) {
        const product = await this.findProduct(input.tenantUuid, input.productUuid);

        const links = await prisma.productOptionGroup.findMany({
            where: {
                tenantUuid: input.tenantUuid,
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
                tenantUuid: input.tenantUuid,
                productUuid: input.productUuid,
                optionGroupUuid: input.groupUuid,
            },
        });

        await MenuCacheService.invalidate({
            tenantUuid: product.tenantUuid,
            storeUuid: product.storeUuid,
            reason: "PRODUCT_UPDATED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[OptionGroupAdmin] Unlinked from product", {
            productUuid: input.productUuid,
            groupUuid: input.groupUuid,
        });

        return { unlinked: true };
    }
}