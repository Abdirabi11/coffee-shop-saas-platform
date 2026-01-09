import { invalidateCache } from "./cache.js"


export const invalidateSuperAdminAnalyticsCache= async ()=>{
    await invalidateCache("sa:analytics:*")
};

export const invalidateTenantAnalyticsCache = async (
    tenantUuid: string
  ) => {
    await invalidateCache(`tenant:${tenantUuid}:analytics:*`);
};