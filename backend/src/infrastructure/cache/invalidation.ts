import { invalidateCache } from "./cache.ts";

export const invalidateAdminDashboards = async () => {
  await invalidateCache("dashboard:admin:*");
};

// Every withCache key for a tenant lives under `tenant:{uuid}:` (dashboard,
// overview, analytics, billing...). The old `dashboard:tenant:*` prefix
// matched nothing.
export const invalidateTenantCaches = async (tenantUuid: string) => {
  await invalidateCache(`tenant:${tenantUuid}:*`);
};