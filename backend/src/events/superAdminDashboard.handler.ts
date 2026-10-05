import { bumpCacheVersion } from "../infrastructure/cache/cacheVersion.ts";
import { invalidateOnFraudEvent, invalidateOnPaymentEvent, invalidateOnTenantEvent } from "../infrastructure/cache/superAdmin.cache.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { DomainEvent } from "./event.types.ts";
import { eventBus } from "./eventBus.ts";

// Event names are the ones actually emitted in the codebase. Listeners for
// ORDER_COMPLETED, PAYMENT_SUCCEEDED, TENANT_CREATED/SUSPENDED/REACTIVATED and
// SYSTEM_ALERT were removed: nothing emits them. Add them back alongside an
// emitter.
export function registerSuperAdminDashboardHandlers() {
    // ── Order events → tenant + store + super admin dashboards ─────────────

    eventBus.on("ORDER_CREATED", async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            // Super admin overview sees order counts
            invalidateOnPaymentEvent(),
        ]);
    });

    // ── Payment events → revenue caches at all levels ──────────────────────

    eventBus.on("PAYMENT_CONFIRMED", async ({ tenantUuid, storeUuid }) => {
        await Promise.all([
            bumpCacheVersion(`tenant:${tenantUuid}:dashboard`),
            bumpCacheVersion(`store:${storeUuid}:dashboard`),
            invalidateOnPaymentEvent(),
        ]);
    });

    eventBus.on("PAYMENT_FAILED", async ({ tenantUuid, storeUuid }) => {
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

    // ── Subscription events → tenant overview ──────────────────────────────

    eventBus.on(DomainEvent.SUBSCRIPTION_CREATED, async () => {
        await invalidateOnTenantEvent();
    });

    // Emitted with this spelling (DomainEvent has SUBSCRIPTION_CANCELED)
    eventBus.on("SUBSCRIPTION_CANCELLED", async () => {
        await invalidateOnTenantEvent();
    });

    // ── Fraud / Security events ────────────────────────────────────────────

    eventBus.on("FRAUD_DETECTED", async () => {
        await invalidateOnFraudEvent();
    });

    logWithContext("info", "[SuperAdminDashboard] Event handlers registered", {});
}
