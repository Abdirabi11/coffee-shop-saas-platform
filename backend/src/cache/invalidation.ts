import { invalidateCache } from "./cache.ts.js";

export const invalidateAdminDashboards = async () => {
  await invalidateCache("dashboard:admin:*");
};

export const invalidateTenantCaches = async (tenantUuid: string) => {
  await invalidateCache(`dashboard:tenant:${tenantUuid}:*`);
};