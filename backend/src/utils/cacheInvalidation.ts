import { invalidateCache } from "../infrastructure/cache/cache.ts";

// Real keys carry suffixes (date ranges, pagination), so exact-key DELs on
// "sa:dashboard:overview" etc. never matched anything. Invalidate by prefix.
export const invalidateSuperAdminDashboardCache= async ()=>{
    await Promise.all([
        invalidateCache("sa:dashboard:overview:*"),
        invalidateCache("sa:dashboard:tenants:*"),
        invalidateCache("sa:dashboard:tenant-health"),
    ]);
};
