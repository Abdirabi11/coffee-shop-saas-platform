import { z } from "zod";

// Zero-padded 24h time: MenuService compares these as strings against the
// store-local "HH:mm", so "9:00" would sort wrong
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "time must be HH:mm (24h, zero-padded)");

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

// PUT .../availability replaces the whole schedule; omitted fields clear
export const scheduleSchema = z
    .object({
        availableDays: z.array(z.enum(WEEKDAYS)).max(7).default([])
            .transform((days) => [...new Set(days)]),
        timeSlots: z
            .array(
                z.object({ start: hhmm, end: hhmm }).refine((s) => s.start < s.end, {
                    message: "end must be after start (split an overnight window into two slots)",
                })
            )
            .max(10)
            .nullish()
            .transform((slots) => slots ?? null),
        availableFrom: z.coerce.date().nullish().transform((d) => d ?? null),
        availableUntil: z.coerce.date().nullish().transform((d) => d ?? null),
    })
    .refine((s) => !s.availableFrom || !s.availableUntil || s.availableFrom < s.availableUntil, {
        message: "availableFrom must be before availableUntil",
        path: ["availableUntil"],
    });

export const reorderCategoriesSchema = z.object({
    storeUuid: z.string().uuid(),
    // Every category of the store, in the new menu order
    categoryUuids: z.array(z.string().uuid()).min(1).max(500),
});

export const updateOptionGroupSchema = z
    .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullish(),
        selectionType: z.enum(["SINGLE", "MULTIPLE", "QUANTITY"]).optional(),
        minSelections: z.number().int().min(0).max(50).optional(),
        maxSelections: z.number().int().min(1).max(50).nullable().optional(),
        isRequired: z.boolean().optional(),
        order: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const createOptionSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullish(),
    extraCost: z.number().int().min(0).default(0), // cents
    order: z.number().int().min(0).optional(),
    isAvailable: z.boolean().optional(),
    trackInventory: z.boolean().default(false),
    currentStock: z.number().int().min(0).optional(),
});

export const updateOptionSchema = z
    .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullish(),
        extraCost: z.number().int().min(0).optional(),
        order: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        isAvailable: z.boolean().optional(),
        trackInventory: z.boolean().optional(),
        currentStock: z.number().int().min(0).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
