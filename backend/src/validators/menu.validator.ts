import Joi from "joi";

export class MenuValidators {

    // MENU RETRIEVAL
    static getMenu = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        includeUnavailable: Joi.boolean().optional(),
        categoryUuid: Joi.string().uuid().optional(),
    });

    static getProduct = Joi.object({
        productUuid: Joi.string().uuid().required(),
        storeUuid: Joi.string().uuid().required(),
    });

    // ORDER VALIDATION
    static validateOrder = Joi.object({
        productUuid: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(100).required(),
        selectedOptions: Joi.array().items(
        Joi.object({
            groupUuid: Joi.string().uuid().required(),
            optionUuids: Joi.array()
            .items(Joi.string().uuid())
            .min(0)
            .required(),
        })
        ).default([]),
    });
        
    // FAVORITES
    static toggleFavorite = Joi.object({
        productUuid: Joi.string().uuid().required(),
        storeUuid: Joi.string().uuid().required(),
    });

    // ANALYTICS
    static trackEvent = Joi.object({
        eventType: Joi.string()
        .valid(
            "MENU_VIEW",
            "CATEGORY_VIEW",
            "PRODUCT_VIEW",
            "PRODUCT_ADD_TO_CART",
            "FAVORITE_ADDED"
        )
        .required(),
        entityType: Joi.string()
        .valid("CATEGORY", "PRODUCT", "OPTION")
        .when("eventType", {
            is: Joi.string().regex(/VIEW|ADD/),
            then: Joi.required(),
            otherwise: Joi.optional(),
        }),
        entityUuid: Joi.string().uuid().optional(),
        productPrice: Joi.number().integer().min(0).optional(),
        quantity: Joi.number().integer().min(1).optional(),
        sessionId: Joi.string().optional(),
        deviceType: Joi.string()
        .valid("WEB", "IOS", "ANDROID", "TABLET", "DESKTOP")
        .optional(),
        platform: Joi.string()
        .valid("WEB", "IOS", "ANDROID")
        .optional(),
    });

    // SEARCH & FILTER
    static searchMenu = Joi.object({
        query: Joi.string().min(2).max(100).required(),
        storeUuid: Joi.string().uuid().required(),
        categoryUuid: Joi.string().uuid().optional(),
        maxResults: Joi.number().integer().min(1).max(50).default(20),
    });

    static filterMenu = Joi.object({
        minPrice: Joi.number().integer().min(0).optional(),
        maxPrice: Joi.number().integer().min(0).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        onlyFavorites: Joi.boolean().optional(),
        onlyAvailable: Joi.boolean().default(true),
        sortBy: Joi.string()
        .valid("price_asc", "price_desc", "name", "popularity")
        .optional(),
    }).custom((value, helpers) => {
        if (value.minPrice && value.maxPrice && value.minPrice > value.maxPrice) {
            return helpers.error("custom.invalidPriceRange");
        }
        return value;
    });

    // ADMIN - CATEGORY
    static createCategory = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        name: Joi.string().min(1).max(100).required(),
        description: Joi.string().max(500).optional().allow(null),
        imageUrl: Joi.string().uri().optional().allow(null),
        order: Joi.number().integer().min(0).default(0),
        isActive: Joi.boolean().default(true),
        availableDays: Joi.array()
        .items(
            Joi.string().valid(
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY"
            )
        )
        .optional(),
        timeSlots: Joi.array()
        .items(
            Joi.object({
            start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            })
        )
        .optional(),
    });

    static updateCategory = Joi.object({
        name: Joi.string().min(1).max(100).optional(),
        description: Joi.string().max(500).optional().allow(null),
        imageUrl: Joi.string().uri().optional().allow(null),
        order: Joi.number().integer().min(0).optional(),
        isActive: Joi.boolean().optional(),
        isAvailable: Joi.boolean().optional(),
        availableDays: Joi.array()
            .items(Joi.string())
            .optional(),
        timeSlots: Joi.array().items(Joi.object()).optional(),
    });

    // ADMIN - PRODUCT
    static createProduct = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        categoryUuid: Joi.string().uuid().required(),
        name: Joi.string().min(1).max(100).required(),
        description: Joi.string().max(1000).optional().allow(null),
        imageUrl: Joi.string().uri().optional().allow(null),
        basePrice: Joi.number().integer().min(0).required(),
        sku: Joi.string().max(50).optional().allow(null),
        trackInventory: Joi.boolean().default(false),
        currentStock: Joi.number().integer().min(0).optional(),
        lowStockThreshold: Joi.number().integer().min(0).optional(),
        isActive: Joi.boolean().default(true),
        isFeatured: Joi.boolean().default(false),
        tags: Joi.array().items(Joi.string()).optional(),
        calories: Joi.number().integer().min(0).optional(),
        preparationTime: Joi.number().integer().min(0).optional(),
    });

    static updateProduct = Joi.object({
        categoryUuid: Joi.string().uuid().optional(),
        name: Joi.string().min(1).max(100).optional(),
        description: Joi.string().max(1000).optional().allow(null),
        imageUrl: Joi.string().uri().optional().allow(null),
        basePrice: Joi.number().integer().min(0).optional(),
        sku: Joi.string().max(50).optional().allow(null),
        trackInventory: Joi.boolean().optional(),
        currentStock: Joi.number().integer().min(0).optional(),
        lowStockThreshold: Joi.number().integer().min(0).optional(),
        isActive: Joi.boolean().optional(),
        isAvailable: Joi.boolean().optional(),
        isFeatured: Joi.boolean().optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        calories: Joi.number().integer().min(0).optional(),
        preparationTime: Joi.number().integer().min(0).optional(),
        order: Joi.number().integer().min(0).optional(),
    });

    // ADMIN - OPTION GROUP
    static createOptionGroup = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        name: Joi.string().min(1).max(100).required(),
        description: Joi.string().max(500).optional().allow(null),
        selectionType: Joi.string()
            .valid("SINGLE", "MULTIPLE", "QUANTITY")
            .default("SINGLE"),
        minSelections: Joi.number().integer().min(0).default(0),
        maxSelections: Joi.number().integer().min(1).optional(),
        isRequired: Joi.boolean().default(false),
    }).custom((value, helpers) => {
        if (
            value.maxSelections &&
            value.minSelections > value.maxSelections
        ) {
            return helpers.error("custom.invalidSelectionRange");
        }
         return value;
    });

    static updateOptionGroup = Joi.object({
        name: Joi.string().min(1).max(100).optional(),
        description: Joi.string().max(500).optional().allow(null),
        selectionType: Joi.string()
            .valid("SINGLE", "MULTIPLE", "QUANTITY")
            .optional(),
        minSelections: Joi.number().integer().min(0).optional(),
        maxSelections: Joi.number().integer().min(1).optional(),
        isRequired: Joi.boolean().optional(),
        isActive: Joi.boolean().optional(),
    });

    // ADMIN - OPTION
    static createOption = Joi.object({
        optionGroupUuid: Joi.string().uuid().required(),
        name: Joi.string().min(1).max(100).required(),
        description: Joi.string().max(500).optional().allow(null),
        extraCost: Joi.number().integer().min(0).default(0),
        trackInventory: Joi.boolean().default(false),
        currentStock: Joi.number().integer().min(0).optional(),
    });

    static updateOption = Joi.object({
        name: Joi.string().min(1).max(100).optional(),
        description: Joi.string().max(500).optional().allow(null),
        extraCost: Joi.number().integer().min(0).optional(),
        isActive: Joi.boolean().optional(),
        isAvailable: Joi.boolean().optional(),
        trackInventory: Joi.boolean().optional(),
        currentStock: Joi.number().integer().min(0).optional(),
    });

    // BULK OPERATIONS
    static bulkUpdatePrices = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        updates: Joi.array()
            .items(
                Joi.object({
                productUuid: Joi.string().uuid().required(),
                newPrice: Joi.number().integer().min(0).required(),
                })
            )
            .min(1)
            .max(100)
            .required(),
        reason: Joi.string().max(200).optional(),
    });

    static bulkUpdateAvailability = Joi.object({
        storeUuid: Joi.string().uuid().required(),
        productUuids: Joi.array()
            .items(Joi.string().uuid())
            .min(1)
            .max(100)
            .required(),
        isAvailable: Joi.boolean().required(),
        reason: Joi.string().max(200).optional(),
    });
}