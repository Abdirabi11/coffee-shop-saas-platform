import { z } from "zod";


export const dateRangeSchema = z.object({
  dateFrom: z.string().datetime({ message: "Invalid ISO date" }).optional(),
  dateTo: z.string().datetime({ message: "Invalid ISO date" }).optional(),
}).refine(
  (data) => {
    // If one is provided, both must be
    if (data.dateFrom && !data.dateTo) return false;
    if (!data.dateFrom && data.dateTo) return false;
    return true;
  },
  { message: "Both dateFrom and dateTo must be provided together" }
);
 
// Required date range (for revenue, tenants, growth)
export const dateRangeRequiredSchema = z.object({
  dateFrom: z.string().datetime({ message: "Invalid ISO date for dateFrom" }),
  dateTo: z.string().datetime({ message: "Invalid ISO date for dateTo" }),
}).refine(
  (data) => new Date(data.dateFrom) < new Date(data.dateTo),
  { message: "dateFrom must be before dateTo" }
);
 
// Limit param (for alerts, revenue trend, etc.)
export const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  months: z.coerce.number().int().min(1).max(60).optional().default(12),
});
 
// Snapshot query (for generic analytics)
export const snapshotQuerySchema = z.object({
  type: z.string().min(1, "type is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  tenantUuid: z.string().uuid().optional(),
  storeUuid: z.string().uuid().optional(),
});
 
// Tenant list with pagination
export const tenantListSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});