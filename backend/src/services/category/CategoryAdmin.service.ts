import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MenuCacheService } from "../menu/menuCache.service.ts";



export class CategoryAdminService {

    static async getCategories(storeUuid: string) {
        return prisma.category.findMany({
            where: { storeUuid },
            orderBy: { order: "asc" },
            include: {
                products: {
                    select: {
                        uuid: true,
                        name: true,
                        isActive: true,
                        isAvailable: true,
                    },
                },
            },
        });
    }

    static async createCategory(input: {
        tenantUuid: string;
        storeUuid: string;
        name: string;
        slug?: string; 
        description?: string;
        imageUrl?: string;
        order?: number;
        isActive?: boolean;
        availableDays?: string[];
        timeSlots?: any;
        triggeredBy: string;
    }) {
        const category = await prisma.category.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: input.name,
                slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),  // <-- add
                description: input.description,
                imageUrl: input.imageUrl,
                order: input.order,
                isActive: input.isActive,
                availableDays: input.availableDays,
                timeSlots: input.timeSlots,
            },
        });

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            reason: "CATEGORY_CREATED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[CategoryAdmin] Category created", {
            categoryUuid: category.uuid,
            name: category.name,
        });

        return category;
    }

    static async updateCategory(input: {
        categoryUuid: string;
        updateData: Record<string, any>;
        triggeredBy: string;
    }) {
        const category = await prisma.category.findUnique({
            where: { uuid: input.categoryUuid },
        });

        if (!category) {
            throw new Error("CATEGORY_NOT_FOUND");
        }

        const updated = await prisma.category.update({
            where: { uuid: input.categoryUuid },
            data: input.updateData,
        });

        await MenuCacheService.invalidate({
            tenantUuid: category.tenantUuid,
            storeUuid: category.storeUuid,
            reason: "CATEGORY_UPDATED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[CategoryAdmin] Category updated", {
            categoryUuid: input.categoryUuid,
            changes: Object.keys(input.updateData),
        });

        return updated;
    }

    static async deleteCategory(input: {
        categoryUuid: string;
        triggeredBy: string;
    }) {
        const category = await prisma.category.findUnique({
            where: { uuid: input.categoryUuid },
            include: { products: { select: { uuid: true } } },
        });

        if (!category) {
            throw new Error("CATEGORY_NOT_FOUND");
        }

        if (category.products.length > 0) {
            throw new Error("CATEGORY_HAS_PRODUCTS");
        }

        await prisma.category.delete({
            where: { uuid: input.categoryUuid },
        });

        await MenuCacheService.invalidate({
            tenantUuid: category.tenantUuid,
            storeUuid: category.storeUuid,
            reason: "CATEGORY_DELETED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[CategoryAdmin] Category deleted", {
            categoryUuid: input.categoryUuid,
            name: category.name,
        });

        return { deleted: true, name: category.name };
    }
}