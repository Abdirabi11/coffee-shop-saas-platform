import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { invalidateCache } from "./cache.ts";


export async function invalidateSuperAdminDashboard() {
    await invalidateCache("sa:dashboard:*");
    logWithContext("info", "[Cache] SuperAdmin dashboard invalidated");
}
 
export async function invalidateSuperAdminOverview() {
    await invalidateCache("sa:dashboard:overview:*");
}
 
export async function invalidateSuperAdminHealth() {
    await invalidateCache("sa:dashboard:health");
}
 
export async function invalidateSuperAdminRisk() {
    await invalidateCache("sa:dashboard:risk");
}
 
export async function invalidateSuperAdminAlerts() {
    await invalidateCache("sa:dashboard:alerts:*");
}
 
export async function invalidateSuperAdminTenantHealth() {
    await invalidateCache("sa:dashboard:tenant-health");
}

export async function invalidateSuperAdminAnalytics() {
    await invalidateCache("sa:analytics:*");
    logWithContext("info", "[Cache] SuperAdmin analytics invalidated");
}
 
export async function invalidateSuperAdminKPIs() {
  await invalidateCache("sa:analytics:kpis");
}
 
export async function invalidateSuperAdminFraudAnalytics() {
    await invalidateCache("sa:analytics:fraud");
}
 
export async function invalidateTenantAnalyticsCache(tenantUuid: string) {
    await invalidateCache(`tenant:${tenantUuid}:analytics:*`);
    logWithContext("info", "[Cache] Tenant analytics invalidated", { tenantUuid });
}
 
export async function invalidateOnPaymentEvent() {
    // Payment events affect: overview revenue, health, KPIs, risk
    await Promise.all([
        invalidateCache("sa:dashboard:overview:*"),
        invalidateCache("sa:dashboard:health"),
        invalidateCache("sa:analytics:kpis"),
    ]);
}
 
export async function invalidateOnTenantEvent() {
    // Tenant creation/suspension affects: overview, health, tenant list, KPIs
    await Promise.all([
        invalidateCache("sa:dashboard:overview:*"),
        invalidateCache("sa:dashboard:health"),
        invalidateCache("sa:dashboard:tenant-health"),
        invalidateCache("sa:dashboard:tenant-list:*"),
        invalidateCache("sa:analytics:kpis"),
    ]);
}
 
export async function invalidateOnFraudEvent() {
    await Promise.all([
        invalidateCache("sa:dashboard:risk"),
        invalidateCache("sa:analytics:fraud"),
    ]);
}
 
export async function invalidateOnAlertEvent() {
    await invalidateCache("sa:dashboard:alerts:*");
}
 