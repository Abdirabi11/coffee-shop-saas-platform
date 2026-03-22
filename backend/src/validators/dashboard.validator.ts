import { z } from "zod";
 
export const timeRangeQuerySchema = z.object({
  timeRange: z
    .enum(["today", "week", "month", "quarter", "year"])
    .optional()
    .default("today"),
});
 
export const analyticsQuerySchema = z.object({
    from: z
        .string()
        .datetime({ message: "Invalid ISO date" })
        .optional(),
    to: z
        .string()
        .datetime({ message: "Invalid ISO date" })
        .optional(),
    storeUuid: z.string().uuid().optional(),
    granularity: z.enum(["hour", "day", "week", "month"]).optional(),
});
 
export const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    days: z.coerce.number().int().min(1).max(365).optional().default(30),
});