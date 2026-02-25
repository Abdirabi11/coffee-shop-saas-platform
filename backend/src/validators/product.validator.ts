import { z } from "zod";

export const createProductSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    shortDescription: z.string().max(500).optional(),
    
    sku: z.string().max(100).optional(),
    
    categoryUuid: z.string().uuid().optional(),
    tags: z.array(z.string()).max(20).default([]),
    
    basePrice: z.number().int().min(0).max(1000000),
    currency: z.string().length(3).default("USD"),
    
    imageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).max(10).default([]),
  
    trackInventory: z.boolean().default(false),
    lowStockThreshold: z.number().int().min(0).optional(),
    
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    isAvailable: z.boolean().default(true),
    
    visibleOnMenu: z.boolean().default(true),
    visibleOnline: z.boolean().default(true),
    
    displayOrder: z.number().int().min(0).default(0),
    preparationTime: z.number().int().min(0).max(300).optional(),
    
    minOrderQuantity: z.number().int().min(1).default(1),
    maxOrderQuantity: z.number().int().min(1).optional(),
    dailyLimit: z.number().int().min(1).optional(),
    
    calories: z.number().int().min(0).optional(),
    allergens: z.array(z.string()).default([]),
    dietaryInfo: z.record(z.any()).optional(),
    
    searchKeywords: z.array(z.string()).max(50).default([]),
}).refine(
    (data) => {
        if (data.maxOrderQuantity && data.maxOrderQuantity < data.minOrderQuantity) {
        return false;
        }
        return true;
    },
    {
        message: "maxOrderQuantity must be >= minOrderQuantity",
    }
);

export const updateProductSchema = createProductSchema.partial();

export const createProductAvailabilitySchema = z.object({
    scheduleType: z.enum(["RECURRING", "SPECIFIC_DATE", "DATE_RANGE"]).default("RECURRING"),
    
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(), // HH:MM
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    
    specificDate: z.coerce.date().optional(),
    allDay: z.boolean().default(false),
    
    isException: z.boolean().default(false),
    priority: z.number().int().min(0).default(0),
    
    maxQuantity: z.number().int().min(0).optional(),
    reason: z.string().max(500).optional(),
    
    effectiveFrom: z.coerce.date().optional(),
    effectiveUntil: z.coerce.date().optional(),
}).refine(
    (data) => {
        if (data.scheduleType === "RECURRING" && data.dayOfWeek === undefined) {
            return false;
        }
        if (data.scheduleType === "SPECIFIC_DATE" && !data.specificDate) {
            return false;
        }
        if (!data.allDay && (!data.startTime || !data.endTime)) {
            return false;
        }
            return true;
    },
    {
        message: "Invalid availability configuration",
    }
);

export const createOptionGroupSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    
    required: z.boolean().default(false),
    multiSelect: z.boolean().default(false),
    
    minSelections: z.number().int().min(0).default(0),
    maxSelections: z.number().int().min(1).optional(),
    
    displayOrder: z.number().int().min(0).default(0),
    displayStyle: z.enum(["LIST", "GRID", "DROPDOWN"]).default("LIST"),
}).refine(
    (data) => {
        if (data.maxSelections && data.maxSelections < data.minSelections) {
            return false;
        }
        if (data.required && data.minSelections === 0) {
            return false;
        }
            return true;
    },
    {
        message: "Invalid selection rules",
    }
);

export const createOptionSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    sku: z.string().max(100).optional(),
    
    extraCost: z.number().int().default(0),
    discountedCost: z.number().int().optional(),
    
    displayOrder: z.number().int().min(0).default(0),
    imageUrl: z.string().url().optional(),
    
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    isAvailable: z.boolean().default(true),
    
    trackStock: z.boolean().default(false),
    stockQuantity: z.number().int().min(0).optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    
    dailyLimit: z.number().int().min(1).optional(),
    maxPerOrder: z.number().int().min(1).optional(),
    
    calorieAdjustment: z.number().int().optional(),
});
