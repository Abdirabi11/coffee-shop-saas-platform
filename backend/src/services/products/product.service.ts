import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.js";
import { MenuCacheService } from "../menu/menuCache.service.ts";
import { ProductAvailabilityService } from "./product-availability.service.ts";


export class ProductService{
    static async create( input: {
        tenantUuid: string;
        storeUuid: string;
        data: any;
        createdBy: string;
    }){
        logWithContext("info", "[Product] Creating product", {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            name: input.data.name,
        });
      
        // Generate search vector for full-text search
        const searchVector = this.generateSearchVector(input.data);

        const product = await prisma.product.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                
                name: input.data.name,
                description: input.data.description,
                shortDescription: input.data.shortDescription,
                sku: input.data.sku,
                
                categoryUuid: input.data.categoryUuid,
                tags: input.data.tags || [],
                
                basePrice: input.data.basePrice,
                currency: input.data.currency || "USD",
                
                imageUrl: input.data.imageUrl,
                imageUrls: input.data.imageUrls || [],
                
                trackInventory: input.data.trackInventory || false,
                lowStockThreshold: input.data.lowStockThreshold,
                
                isActive: input.data.isActive ?? true,
                isFeatured: input.data.isFeatured || false,
                isAvailable: input.data.isAvailable ?? true,
                
                visibleOnMenu: input.data.visibleOnMenu ?? true,
                visibleOnline: input.data.visibleOnline ?? true,
                
                displayOrder: input.data.displayOrder || 0,
                preparationTime: input.data.preparationTime,
                
                minOrderQuantity: input.data.minOrderQuantity || 1,
                maxOrderQuantity: input.data.maxOrderQuantity,
                dailyLimit: input.data.dailyLimit,
                
                calories: input.data.calories,
                allergens: input.data.allergens || [],
                dietaryInfo: input.data.dietaryInfo,
                
                searchKeywords: input.data.searchKeywords || [],
                searchVector,
                
                createdBy: input.createdBy,
            },
            include: {
                category: true,
            },
        });

        await MenuCacheService.invalidate(input.storeUuid);

        // Emit event
        EventBus.on("PRODUCT_CREATED", async (payload) => {
            await prisma.auditLog.create({
                data: {
                    tenantUuid: payload.tenantUuid,
                    action: "PRODUCT_CREATED",
                    entityType: "PRODUCT",
                    entityUuid: payload.productUuid,
                    performedBy: payload.createdBy,
                    metadata: payload,
                },
            });
        });

        // Metrics
        MetricsService.increment("product.created", 1, {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
        });
    
        logWithContext("info", "[Product] Product created", {
            productUuid: product.uuid,
            name: product.name,
        });
    
        return product;
    };

    static async list(input: {
        tenantUuid: string;
        storeUuid: string;
        filters?: {
            categoryUuid?: string;
            isActive?: boolean;
            isFeatured?: boolean;
            search?: string;
            tags?: string[];
        };
        pagination?: {
            page?: number;
            limit?: number;
        };
    }){
        const page = input.pagination?.page || 1;
        const limit = input.pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            isDeleted: false,
        };

        // Apply filters
        if (input.filters?.categoryUuid) {
            where.categoryUuid = input.filters.categoryUuid;
        };

        if (input.filters?.isActive !== undefined) {
            where.isActive = input.filters.isActive;
        };
      
        if (input.filters?.isFeatured !== undefined) {
            where.isFeatured = input.filters.isFeatured;
        };
      
        if (input.filters?.search) {
            where.OR = [
                { name: { contains: input.filters.search, mode: "insensitive" } },
                { description: { contains: input.filters.search, mode: "insensitive" } },
                { searchKeywords: { has: input.filters.search.toLowerCase() } },
            ];
        };

        if (input.filters?.tags && input.filters.tags.length > 0) {
            where.tags = { hasSome: input.filters.tags };
        };

        // Get total count for pagination
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: {
                    category: true,
                    optionGroups: {
                    where: { isActive: true },
                    include: {
                        options: {
                        where: { isActive: true },
                        orderBy: { displayOrder: "asc" },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                    },
                    inventory: true,
                },
                orderBy: [
                    { displayOrder: "asc" },
                    { createdAt: "desc" },
                ],
                skip,
                take: limit,
            }),
            prisma.product.count({ where }),
        ]);

        return {
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    };

    //Get single product with availability check
    static async getByUuid(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        checkAvailability?: boolean;
    }) {
        const product = await prisma.product.findFirst({
            where: {
                uuid: input.productUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                isDeleted: false,
            },
            include: {
                category: true,
                optionGroups: {
                    where: { isActive: true },
                    include: {
                        options: {
                            where: { isActive: true },
                            orderBy: { displayOrder: "asc" },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                },
                inventory: true,
                availability: {
                    where: { isActive: true },
                },
            },
        });
      
        if (!product) {
            return null;
        }
      
          // Check availability if requested
        if (input.checkAvailability) {
            const isAvailable = await ProductAvailabilityService.isProductAvailable({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                now: new Date(),
            });
      
            return {
                ...product,
                currentlyAvailable: isAvailable,
            };
        }
      
        return product;
    }

    //Update product with version control
    static async update(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        data: any;
        updatedBy: string;
    }) {
        const current = await prisma.product.findFirst({
            where: {
                uuid: input.productUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                isDeleted: false,
            },
        });
        
        if (!current) {
            throw new Error("PRODUCT_NOT_FOUND");
        }
        
        // Update search vector if name/description changed
        const searchVector = (input.data.name || input.data.description)
            ? this.generateSearchVector({ ...current, ...input.data })
            : undefined;
      
        const product = await prisma.product.update({
            where: { uuid: input.productUuid },
            data: {
                ...input.data,
                ...(searchVector && { searchVector }),
                version: { increment: 1 },
                updatedAt: new Date(),
            },
            include: {
                category: true,
                optionGroups: {
                    include: { options: true },
                },
            },
        });
      
        // Invalidate cache
        await MenuCacheService.invalidate(input.storeUuid);
      
        // Emit event
        EventBus.emit("PRODUCT_UPDATED", {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            productUuid: product.uuid,
            changes: Object.keys(input.data),
            updatedBy: input.updatedBy,
        });
      
        logWithContext("info", "[Product] Product updated", {
            productUuid: product.uuid,
            version: product.version,
        });
      
        return product;  
    }

    static async softDelete(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        deletedBy: string;
    }) {
        const product = await prisma.product.update({
            where: {
                uuid: input.productUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            },
            data: {
                isDeleted: true,
                isActive: false,
                deletedAt: new Date(),
                deletedBy: input.deletedBy,
            },
        });
      
        // Invalidate cache
        await MenuCacheService.invalidate(input.storeUuid);
      
        // Emit event
        EventBus.emit("PRODUCT_DELETED", {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            productUuid: product.uuid,
            deletedBy: input.deletedBy,
        });
      
        logWithContext("info", "[Product] Product soft deleted", {
            productUuid: product.uuid,
        });
      
        return product;
    }

    static async search(input: {
        tenantUuid: string;
        storeUuid: string;
        query: string;
        filters?: {
            categoryUuid?: string;
            minPrice?: number;
            maxPrice?: number;
            tags?: string[];
            dietaryInfo?: string[];
        };
        pagination?: {
            page?: number;
            limit?: number;
        };
    }) {
        const page = input.pagination?.page || 1;
        const limit = input.pagination?.limit || 20;
        const skip = (page - 1) * limit;
      
        // Build search conditions
        const where: any = {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            isActive: true,
            isDeleted: false,
            visibleOnline: true,
        };
      
        // Full-text search
        if (input.query) {
            where.searchVector = {
                contains: input.query.toLowerCase(),
            }
        };
      
        // Filters
        if (input.filters?.categoryUuid) {
            where.categoryUuid = input.filters.categoryUuid;
        };
      
        if (input.filters?.minPrice || input.filters?.maxPrice) {
            where.basePrice = {
                ...(input.filters.minPrice && { gte: input.filters.minPrice }),
                ...(input.filters.maxPrice && { lte: input.filters.maxPrice }),
            }
        };
      
        if (input.filters?.tags && input.filters.tags.length > 0) {
            where.tags = { hasSome: input.filters.tags };
        };
      
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: {
                    category: true,
                    inventory: true,
                },
                orderBy: [
                    { isFeatured: "desc" }, // Featured first
                    { displayOrder: "asc" },
                ],
                skip,
                take: limit,
            }),
            prisma.product.count({ where }),
        ]);
      
        return {
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    //Bulk update products (e.g., change category, activate/deactivate)
    static async bulkUpdate(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuids: string[];
        data: Partial<{
            isActive: boolean;
            categoryUuid: string;
            displayOrder: number;
        }>;
        updatedBy: string;
    }) {
        const result = await prisma.product.updateMany({
            where: {
                uuid: { in: input.productUuids },
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                isDeleted: false,
            },
            data: input.data,
        });

        // Invalidate cache
        await MenuCacheService.invalidate(input.storeUuid);

        // Emit event
        EventBus.emit("PRODUCTS_BULK_UPDATED", {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            count: result.count,
            updatedBy: input.updatedBy,
        });

        return result;
    }

    //Generate full-text search vector
    private static generateSearchVector(data: any): string {
        const parts = [
            data.name,
            data.description,
            data.shortDescription,
            data.sku,
            ...(data.tags || []),
            ...(data.searchKeywords || []),
        ].filter(Boolean);

        return parts.join(" ").toLowerCase();
    }
};