import dayjs from "dayjs";
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import prisma from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { redis } from "../../lib/redis.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class MenuService {
    
    //Get store menu with caching
    static async getStoreMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        includeUnavailable?: boolean;
        userUuid?: string; // For personalization
    }) {
        const startTime = Date.now();

        try {
            // Generate cache key
            const version = await getCacheVersion(`menu:${input.storeUuid}`);
            const cacheKey = `menu:${input.storeUuid}:v${version}:${input.includeUnavailable ? "all" : "available"}`;

            // Try cache first
            const cached = await redis.get(cacheKey);
            if (cached) {
                MetricsService.increment("menu.cache.hit");
                logWithContext("debug", "[Menu] Cache hit", {
                    storeUuid: input.storeUuid,
                    cacheKey,
                });

                const menu = JSON.parse(cached);

                // Apply personalization if user
                if (input.userUuid) {
                    return this.applyPersonalization(menu, input.userUuid);
                };

                return menu;
            }

            // Cache miss - fetch from DB
            MetricsService.increment("menu.cache.miss");
            logWithContext("debug", "[Menu] Cache miss - fetching from DB", {
                storeUuid: input.storeUuid,
            });

            const menu = await this.buildMenu({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                includeUnavailable: input.includeUnavailable,
            });

            // Cache for 5 minutes
            await redis.setex(cacheKey, 300, JSON.stringify(menu));

            // Track metrics
            const duration = Date.now() - startTime;
            MetricsService.histogram("menu.load.duration", duration);

            // Apply personalization if user
            if (input.userUuid) {
                return this.applyPersonalization(menu, input.userUuid);
            }

            return menu;

        } catch (error: any) {
            logWithContext("error", "[Menu] Failed to get menu", {
                storeUuid: input.storeUuid,
                error: error.message,
            });

            MetricsService.increment("menu.error");

            throw new Error("MENU_FETCH_FAILED");
        }
    }

    //Build menu from database
    private static async buildMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        includeUnavailable?: boolean;
    }) {
        const now = new Date();

        // Check if store is open
        const store = await prisma.store.findUnique({
            where: { uuid: input.storeUuid },
            select: {
                uuid: true,
                name: true,
                isActive: true,
            },
        });

        if (!store || !store.isActive) {
            return {
                storeUuid: input.storeUuid,
                storeName: store?.name || "Unknown",
                isOpen: false,
                categories: [],
                generatedAt: now.toISOString(),
            };
        }

        // Fetch categories with products
        const categories = await prisma.category.findMany({
            where: {
                storeUuid: input.storeUuid,
                isActive: true,
                ...(input.includeUnavailable ? {} : { isAvailable: true }),
            },
            orderBy: { order: "asc" },
            include: {
                products: {
                    where: {
                        isActive: true,
                        ...(input.includeUnavailable ? {} : { isAvailable: true }),
                    },
                    orderBy: { order: "asc" },
                    include: {
                        optionGroups: {
                            where: { optionGroup: { isActive: true } },
                            orderBy: { order: "asc" },
                            include: {
                                optionGroup: {
                                    include: {
                                        options: {
                                            where: {
                                                isActive: true,
                                                ...(input.includeUnavailable ? {} : { isAvailable: true }),
                                            },
                                            orderBy: { order: "asc" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Transform to menu structure
        const menuCategories = categories
            .filter((category) => {
                // Check time-based availability
                if (!input.includeUnavailable) {
                const isAvailable = this.checkAvailability(category, now);
                return isAvailable && category.products.length > 0;
                }
                return category.products.length > 0;
            })
            .map((category) => ({
                uuid: category.uuid,
                name: category.name,
                description: category.description,
                imageUrl: category.imageUrl,
                order: category.order,
                isAvailable: this.checkAvailability(category, now),
                products: category.products
                    .filter((product) => {
                        if (!input.includeUnavailable) {
                        return this.checkAvailability(product, now);
                        }
                        return true;
                    })
                    .map((product) => ({
                        uuid: product.uuid,
                        name: product.name,
                        description: product.description,
                        imageUrl: product.imageUrl,
                        basePrice: product.basePrice,
                        isAvailable: this.checkAvailability(product, now),
                        isFeatured: product.isFeatured,
                        tags: product.tags,
                        calories: product.calories,
                        preparationTime: product.preparationTime,
                        trackInventory: product.trackInventory,
                        inStock: product.trackInventory
                        ? (product.currentStock ?? 0) > 0
                        : true,
                        currentStock: product.trackInventory ? product.currentStock : null,
                        optionGroups: product.optionGroups.map((pog) => ({
                        uuid: pog.optionGroup.uuid,
                        name: pog.optionGroup.name,
                        description: pog.optionGroup.description,
                        selectionType: pog.optionGroup.selectionType,
                        minSelections: pog.minSelections ?? pog.optionGroup.minSelections,
                        maxSelections: pog.maxSelections ?? pog.optionGroup.maxSelections,
                        isRequired: pog.isRequired ?? pog.optionGroup.isRequired,
                        options: pog.optionGroup.options.map((option) => ({
                            uuid: option.uuid,
                            name: option.name,
                            description: option.description,
                            extraCost: option.extraCost,
                            isAvailable: option.isAvailable,
                            inStock: option.trackInventory
                            ? (option.currentStock ?? 0) > 0
                            : true,
                        })),
                    })),
                })),
            }));

        return {
            storeUuid: input.storeUuid,
            storeName: store.name,
            isOpen: true,
            categories: menuCategories,
            generatedAt: now.toISOString(),
            totalCategories: menuCategories.length,
            totalProducts: menuCategories.reduce(
                (sum, c) => sum + c.products.length,
                0
            ),
        };
    }

    //Check availability based on time rules
    private static checkAvailability(
        entity: {
            availableFrom?: Date | null;
            availableUntil?: Date | null;
            availableDays?: string[];
            timeSlots?: any;
        },
        now: Date
    ): boolean {
        // Check date range
        if (entity.availableFrom && now < entity.availableFrom) {
            return false;
        };

        if (entity.availableUntil && now > entity.availableUntil) {
            return false;
        };

        // Check day of week
        if (entity.availableDays && entity.availableDays.length > 0) {
            const dayName = dayjs(now).format("dddd").toUpperCase();
            if (!entity.availableDays.includes(dayName)) {
                return false;
            };
        }

        // Check time slots
        if (entity.timeSlots && Array.isArray(entity.timeSlots)) {
            const currentTime = dayjs(now).format("HH:mm");
            const isInSlot = entity.timeSlots.some((slot: any) => {
                return currentTime >= slot.start && currentTime <= slot.end;
            });

            if (!isInSlot) {
                return false;
            };
        }

        return true;
    }

    //Apply user personalization
    private static async applyPersonalization(menu: any, userUuid: string) {
        try {
            // Get user favorites
            const favorites = await prisma.userFavorite.findMany({
                where: { userUuid },
                select: { productUuid: true },
            });

            const favoriteUuids = new Set(favorites.map((f) => f.productUuid));

            // Apply to menu
            return {
                ...menu,
                categories: menu.categories.map((category: any) => ({
                    ...category,
                    products: category.products.map((product: any) => ({
                        ...product,
                        isFavorite: favoriteUuids.has(product.uuid),
                    })),
                })),
            };
        } catch (error) {
            logWithContext("warn", "[Menu] Failed to apply personalization", {
                error: error.message,
            });

            // Return menu without personalization if it fails
            return menu;
        }
    }

    //Get single product with details
    static async getProduct(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        userUuid?: string;
    }) {
        try {
            const product = await prisma.product.findUnique({
                where: { uuid: input.productUuid },
                include: {
                    category: {
                        select: {
                        uuid: true,
                        name: true,
                        },
                    },
                    optionGroups: {
                        orderBy: { order: "asc" },
                        include: {
                            optionGroup: {
                                include: {
                                    options: {
                                        where: { active: true },
                                        orderBy: { order: "asc" },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!product || product.storeUuid !== input.storeUuid) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            // Check availability
            const now = new Date();
            const isAvailable = this.checkAvailability(product, now);

            // Check if favorited
            let isFavorite = false;
            if (input.userUuid) {
                const favorite = await prisma.userFavorite.findFirst({
                    where: {
                        userUuid: input.userUuid,
                        productUuid: input.productUuid,
                    },
                });
                isFavorite = !!favorite;
            };

            return {
                uuid: product.uuid,
                name: product.name,
                description: product.description,
                imageUrl: product.imageUrl,
                basePrice: product.basePrice,
                category: product.category,
                isActive: product.isActive,
                isAvailable,
                isFeatured: product.isFeatured,
                isFavorite,
                tags: product.tags,
                calories: product.calories,
                preparationTime: product.preparationTime,
                trackInventory: product.trackInventory,
                inStock: product.trackInventory
                ? (product.currentStock ?? 0) > 0
                : true,
                currentStock: product.trackInventory ? product.currentStock : null,
                optionGroups: product.optionGroups.map((pog) => ({
                    uuid: pog.optionGroup.uuid,
                    name: pog.optionGroup.name,
                    description: pog.optionGroup.description,
                    selectionType: pog.optionGroup.selectionType,
                    minSelections: pog.minSelections ?? pog.optionGroup.minSelections,
                    maxSelections: pog.maxSelections ?? pog.optionGroup.maxSelections,
                    isRequired: pog.isRequired ?? pog.optionGroup.isRequired,
                    options: pog.optionGroup.options.map((option) => ({
                        uuid: option.uuid,
                        name: option.name,
                        description: option.description,
                        extraCost: option.extraCost,
                        isAvailable: option.isAvailable,
                        inStock: option.trackInventory
                        ? (option.currentStock ?? 0) > 0
                        : true,
                    })),
                })),
                viewCount: product.viewCount,
                orderCount: product.orderCount,
            };
        } catch (error: any) {
            logWithContext("error", "[Menu] Failed to get product", {
                productUuid: input.productUuid,
                error: error.message,
            });

            if (error.message === "PRODUCT_NOT_FOUND") {
                throw error;
            }

            throw new Error("PRODUCT_FETCH_FAILED");
        }
    }

    //Validate product + options before adding to cart
    static async validateOrder(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        quantity: number;
        selectedOptions: Array<{
        groupUuid: string;
        optionUuids: string[];
        }>;
    }) {
        try {
            // 1. Get product
            const product = await prisma.product.findUnique({
                where: { uuid: input.productUuid },
                include: {
                    optionGroups: {
                        include: {
                            optionGroup: {
                                include: {
                                    options: {
                                        where: { isActive: true, isAvailable: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!product || product.storeUuid !== input.storeUuid) {
                return {
                    valid: false,
                    error: "PRODUCT_NOT_FOUND",
                    message: "Product not found",
                };
            };

            if (!product.isActive || !product.isAvailable) {
                return {
                    valid: false,
                    error: "PRODUCT_NOT_AVAILABLE",
                    message: "Product is not available",
                };
            };

            // 2. Check inventory
            if (product.trackInventory) {
                if ((product.currentStock ?? 0) < input.quantity) {
                    return {
                        valid: false,
                        error: "INSUFFICIENT_STOCK",
                        message: "Insufficient stock",
                        availableStock: product.currentStock ?? 0,
                    };
                }
            };

            // 3. Validate option selections
            const errors: string[] = [];
            let optionsCost = 0;

            for (const pog of product.optionGroups) {
                const selection = input.selectedOptions.find(
                    (s) => s.groupUuid === pog.optionGroup.uuid
                );

                const minSel = pog.minSelections ?? pog.optionGroup.minSelections;
                const maxSel = pog.maxSelections ?? pog.optionGroup.maxSelections;
                const isRequired = pog.isRequired ?? pog.optionGroup.isRequired;

                const selectedCount = selection?.optionUuids.length ?? 0;

                // Check required
                if (isRequired && selectedCount === 0) {
                    errors.push(
                        `${pog.optionGroup.name} is required`
                    );
                    continue;
                }

                // Check min selections
                if (selectedCount > 0 && selectedCount < minSel) {
                    errors.push(
                        `${pog.optionGroup.name} requires at least ${minSel} selection(s)`
                    );
                }

                // Check max selections
                if (maxSel && selectedCount > maxSel) {
                    errors.push(
                        `${pog.optionGroup.name} allows maximum ${maxSel} selection(s)`
                    );
                }

                // Validate option UUIDs and calculate cost
                if (selection) {
                    const validOptionUuids = pog.optionGroup.options.map((o) => o.uuid);
                    const invalidOptions = selection.optionUuids.filter(
                        (uuid) => !validOptionUuids.includes(uuid)
                    );

                    if (invalidOptions.length > 0) {
                        errors.push(
                        `Invalid options selected for ${pog.optionGroup.name}`
                        );
                    } else {
                        // Calculate option costs
                        const selectedOptions = pog.optionGroup.options.filter((o) =>
                            selection.optionUuids.includes(o.uuid)
                        );

                        optionsCost += selectedOptions.reduce(
                            (sum, o) => sum + o.extraCost,
                            0
                        );
                    }
                }
            }

            if (errors.length > 0) {
                return {
                    valid: false,
                    error: "INVALID_OPTIONS",
                    message: "Invalid option selections",
                    errors,
                };
            }

            // 4. Calculate pricing
            const itemPrice = product.basePrice + optionsCost;
            const totalPrice = itemPrice * input.quantity;

            return {
                valid: true,
                pricing: {
                    basePrice: product.basePrice,
                    optionsCost,
                    itemPrice,
                    quantity: input.quantity,
                    totalPrice,
                },
                product: {
                    uuid: product.uuid,
                    name: product.name,
                    imageUrl: product.imageUrl,
                },
            };
        } catch (error: any) {
            logWithContext("error", "[Menu] Validation failed", {
                productUuid: input.productUuid,
                error: error.message,
            });

            return {
                valid: false,
                error: "VALIDATION_FAILED",
                message: "Failed to validate order",
            };
        }
    }

    //Search menu
    static async searchMenu(input: {
        tenantUuid: string;
        storeUuid: string;
        query: string;
        categoryUuid?: string;
        maxResults?: number;
    }) {
        try {
            const searchTerm = input.query.toLowerCase();

            const products = await prisma.product.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    isActive: true,
                    isAvailable: true,
                    ...(input.categoryUuid ? { categoryUuid: input.categoryUuid } : {}),
                    OR: [
                        { name: { contains: searchTerm, mode: "insensitive" } },
                        { description: { contains: searchTerm, mode: "insensitive" } },
                        { tags: { has: searchTerm } },
                    ],
                },
                take: input.maxResults || 20,
                include: {
                    category: {
                        select: {
                            uuid: true,
                            name: true,
                        },
                    },
                },
                orderBy: [
                    { orderCount: "desc" }, // Popular first
                    { name: "asc" },
                ],
            });

            return {
                query: input.query,
                results: products.map((p) => ({
                    uuid: p.uuid,
                    name: p.name,
                    description: p.description,
                    imageUrl: p.imageUrl,
                    basePrice: p.basePrice,
                    category: p.category,
                    tags: p.tags,
                    isFeatured: p.isFeatured,
                })),
                count: products.length,
            };
        } catch (error: any) {
            logWithContext("error", "[Menu] Search failed", {
                query: input.query,
                error: error.message,
            });

            throw new Error("SEARCH_FAILED");
        }
    }
}
