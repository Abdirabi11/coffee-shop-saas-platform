import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { redis } from "../../lib/redis.js";
import prisma from "../config/prisma.ts"


export class CategoryService{
    //Create category
    static async create(input: {
        tenantUuid: string;
        storeUuid: string;
        name: string;
        description?: string;
        parentUuid?: string;
        imageUrl?: string;
        iconUrl?: string;
        color?: string;
        isFeatured?: boolean;
        createdBy: string;
    }){
        logWithContext("info", "[Category] Creating category", {
            storeUuid: input.storeUuid,
            name: input.name,
        });
    
        try {
            // Get max display order
            const maxOrder = await prisma.category.aggregate({
                where: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    parentUuid: input.parentUuid || null,
                },
                _max: { displayOrder: true },
            });
        
            // Generate slug
            const slug = await this.generateUniqueSlug(
                input.tenantUuid,
                input.storeUuid,
                input.name
            );
 
            // Determine level
            let level = 0;
            if (input.parentUuid) {
                const parent = await prisma.category.findUnique({
                    where: { uuid: input.parentUuid },
                    select: { level: true },
                });
                level = (parent?.level || 0) + 1;
            };
 
            // Create category
            const category = await prisma.category.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    parentUuid: input.parentUuid,
                    name: input.name,
                    slug,
                    description: input.description,
                    level,
                    imageUrl: input.imageUrl,
                    iconUrl: input.iconUrl,
                    color: input.color,
                    displayOrder: (maxOrder._max.displayOrder || 0) + 1,
                    isFeatured: input.isFeatured || false,
                    isActive: true,
                    isVisible: true,
                    alwaysVisible: true,
                },
            });
 
            // Emit event
            EventBus.emit("CATEGORY_CREATED", {
                categoryUuid: category.uuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: category.name,
                createdBy: input.createdBy,
            });
        
            logWithContext("info", "[Category] Category created", {
                categoryUuid: category.uuid,
                name: category.name,
            });
                
            MetricsService.increment("category.created", 1, {
                tenantUuid: input.tenantUuid,
            });
        
            return category;
        
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to create category", {
                error: error.message,
            });
        
            throw error;
        }
    }

    //List categories
    static async list(input: {
        tenantUuid: string;
        storeUuid: string;
        includeChildren?: boolean;
        onlyFeatured?: boolean;
        onlyVisible?: boolean;
    }){
        const where: any = {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            isActive: true,
        };
      
        if (input.onlyFeatured) {
            where.isFeatured = true;
        };
      
        if (input.onlyVisible) {
            where.isVisible = true;
        };

        const categories = await prisma.category.findMany({
            where,
            include: {
                children: input.includeChildren
                    ? {
                        where: { isActive: true, isVisible: true },
                        orderBy: { displayOrder: "asc" },
                    }
                    : false,
                products: {
                    where: { isActive: true },
                    select: { uuid: true, name: true, basePrice: true, imageUrls: true },
                    take: 5,
                },
                _count: {
                    select: {
                        products: {
                            where: { isActive: true },
                        },
                    },
                },
            },
            orderBy: { displayOrder: "asc" },
        });
      
        return categories;
    }

    //Get single category
    static async getByUuid(input: {
        tenantUuid: string;
        categoryUuid: string;
    }) {
        const category = await prisma.category.findFirst({
            where: {
                uuid: input.categoryUuid,
                tenantUuid: input.tenantUuid,
            },
            include: {
                parent: true,
                children: {
                    where: { isActive: true },
                    orderBy: { displayOrder: "asc" },
                },
                products: {
                    where: { isActive: true },
                    include: {
                        inventory: true,
                    },
                },
                availability: {
                    where: { isActive: true },
                },
                visibilitySchedules: true,
            },
        });

        if (!category) {
            throw new Error("CATEGORY_NOT_FOUND");
        };

        return category;
    }

    //Update category
    static async update(input: {
        tenantUuid: string;
        categoryUuid: string;
        data: {
            name?: string;
            description?: string;
            imageUrl?: string;
            iconUrl?: string;
            color?: string;
            isVisible?: boolean;
            isFeatured?: boolean;
            alwaysVisible?: boolean;
        };
        updatedBy: string;
    }) {
        logWithContext("info", "[Category] Updating category", {
            categoryUuid: input.categoryUuid,
        });

        try {
            // If name changed, regenerate slug
            let slug: string | undefined;
            if (input.data.name) {
                const category = await prisma.category.findUnique({
                    where: { uuid: input.categoryUuid },
                    select: { tenantUuid: true, storeUuid: true },
                });

                if (category) {
                    slug = await this.generateUniqueSlug(
                        category.tenantUuid,
                        category.storeUuid,
                        input.data.name
                    );
                }
            };

            const updated = await prisma.category.update({
                where: {
                    uuid: input.categoryUuid,
                    tenantUuid: input.tenantUuid,
                },
                data: {
                    ...input.data,
                    ...(slug && { slug }),
                },
            });

            // Emit event
            EventBus.emit("CATEGORY_UPDATED", {
                categoryUuid: updated.uuid,
                tenantUuid: input.tenantUuid,
                storeUuid: updated.storeUuid,
                changes: input.data,
                updatedBy: input.updatedBy,
            });

            logWithContext("info", "[Category] Category updated", {
                categoryUuid: updated.uuid,
            });

            MetricsService.increment("category.updated", 1);

            return updated;

        } catch (error: any) {
            logWithContext("error", "[Category] Failed to update category", {
                error: error.message,
            });

            throw error;
        }
    }

    //Soft delete category
    static async delete(input: {
        tenantUuid: string;
        categoryUuid: string;
        deletedBy: string;
    }) {
        logWithContext("info", "[Category] Deleting category", {
            categoryUuid: input.categoryUuid,
        });

        try {
            // Check if category has products
            const productCount = await prisma.product.count({
                where: {
                    categoryUuid: input.categoryUuid,
                    isActive: true,
                },
            });

            if (productCount > 0) {
                throw new Error("CATEGORY_HAS_PRODUCTS");
            };

            const deleted = await prisma.category.update({
                where: {
                    uuid: input.categoryUuid,
                    tenantUuid: input.tenantUuid,
                },
                data: {
                    isActive: false,
                    deletedAt: new Date(),
                },
            });

            // Emit event
            EventBus.emit("CATEGORY_DELETED", {
                categoryUuid: deleted.uuid,
                tenantUuid: input.tenantUuid,
                storeUuid: deleted.storeUuid,
                deletedBy: input.deletedBy,
            });

            logWithContext("info", "[Category] Category deleted", {
                categoryUuid: deleted.uuid,
            });

            MetricsService.increment("category.deleted", 1);

            return deleted;

        } catch (error: any) {
            logWithContext("error", "[Category] Failed to delete category", {
                error: error.message,
            });

            throw error;
        }
    }

    //Reorder categories
    static async reorder(input: {
        tenantUuid: string;
        storeUuid: string;
        orders: Array<{ uuid: string; displayOrder: number }>;
        updatedBy: string;
    }) {
        logWithContext("info", "[Category] Reordering categories", {
            storeUuid: input.storeUuid,
            count: input.orders.length,
        });

        try {
            const categories = await prisma.$transaction(
                input.orders.map((item) =>
                    prisma.category.update({
                        where: {
                            uuid: item.uuid,
                            tenantUuid: input.tenantUuid,
                            storeUuid: input.storeUuid,
                        },
                        data: { displayOrder: item.displayOrder },
                    })
                )
            );

            // Emit event
            EventBus.emit("CATEGORY_REORDERED", {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                count: categories.length,
                updatedBy: input.updatedBy,
            });

            logWithContext("info", "[Category] Categories reordered", {
                count: categories.length,
            });

            return categories;

        } catch (error: any) {
            logWithContext("error", "[Category] Failed to reorder categories", {
                error: error.message,
            });

            throw error;
        }
    }

    //Generate unique slug
    private static async generateUniqueSlug(
        tenantUuid: string,
        storeUuid: string,
        name: string
    ): Promise<string> {
        let slug = slugify(name, { lower: true, strict: true });
        let counter = 1;

        while (true) {
            const existing = await prisma.category.findFirst({
                where: {
                    tenantUuid,
                    storeUuid,
                    slug,
                },
            });

            if (!existing) break;

            slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
            counter++;
        };

        return slug;
    }

    //Track category view
    static async trackView(input: {
        tenantUuid: string;
        categoryUuid: string;
    }) {
        try {
        // Increment view count in cache (Redis)
        const today = new Date().toISOString().split("T")[0];
        const key = `category:views:${input.categoryUuid}:${today}`;

        await redis.incr(key);
        await redis.expire(key, 86400 * 7); // Keep for 7 days

        } catch (error: any) {
            // Don't fail if tracking fails
            logWithContext("warn", "[Category] Failed to track view", {
                error: error.message,
            });
        }
    }
}