import { z } from "zod";

export const createCategorySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    parentUuid: z.string().uuid().optional(),
    imageUrl: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    isFeatured: z.boolean().optional(),
});

export const updateCategorySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    isVisible: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    alwaysVisible: z.boolean().optional(),
});