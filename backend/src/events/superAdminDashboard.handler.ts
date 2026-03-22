import { bumpCacheVersion } from "../cache/cacheVersion.js";
import { invalidateOnAlertEvent, invalidateOnFraudEvent, invalidateOnPaymentEvent, invalidateOnTenantEvent } from "../cache/superAdmin.cache.ts";
import { logWithContext } from "../infrastructure/observability/logger.ts";
import { DomainEvent } from "./event.types.ts";
import { eventBus } from "./eventBus.ts";


export function registerSuperAdminDashboardHandlers() {
    // ── Order events → tenant + store + super admin dashboards ─────────────
    
    eventBus.on(DomainEvent.ORDER_CREATED, async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            // Super admin overview sees order counts
            invalidateOnPaymentEvent(),
        ]);
    });
    
    eventBus.on(DomainEvent.ORDER_COMPLETED, async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
        ]);
    });
    
    // ── Payment events → revenue caches at all levels ──────────────────────
    
    eventBus.on(DomainEvent.PAYMENT_SUCCEEDED, async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            invalidateOnPaymentEvent(),
        ]);
    });
    
    eventBus.on(DomainEvent.PAYMENT_FAILED, async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            invalidateOnPaymentEvent(),
        ]);
    });
    
    // ── Invoice events → super admin revenue ───────────────────────────────
    
    eventBus.on(DomainEvent.INVOICE_CREATED, async ({ tenantUuid }) => {
        await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
    });
    
    eventBus.on(DomainEvent.INVOICE_PAID, async ({ tenantUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            invalidateOnPaymentEvent(),
        ]);
    });
    
    eventBus.on(DomainEvent.TENANT_CREATED, async () => {
        await invalidateOnTenantEvent();
    });
    
    eventBus.on(DomainEvent.TENANT_SUSPENDED, async () => {
        await invalidateOnTenantEvent();
    });
    
    eventBus.on(DomainEvent.TENANT_REACTIVATED, async () => {
        await invalidateOnTenantEvent();
    });
    
    eventBus.on(DomainEvent.SUBSCRIPTION_CREATED, async () => {
        await invalidateOnTenantEvent();
    });
    
    eventBus.on(DomainEvent.SUBSCRIPTION_CANCELLED, async () => {
        await invalidateOnTenantEvent();
    });
    
    // ── Fraud / Security events ────────────────────────────────────────────
    
    eventBus.on(DomainEvent.FRAUD_DETECTED, async () => {
        await invalidateOnFraudEvent();
    });
    
    // ── Alert events ───────────────────────────────────────────────────────
    
    eventBus.on(DomainEvent.SYSTEM_ALERT, async () => {
        await invalidateOnAlertEvent();
    });
    
    logWithContext("info", "[SuperAdminDashboard] Event handlers registered");
}