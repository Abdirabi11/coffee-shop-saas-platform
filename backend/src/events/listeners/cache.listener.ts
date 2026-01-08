import { eventBus } from "../eventBus.ts"
import { DomainEvent } from "../event.types.ts"
import { invalidateAdminDashboards, invalidateTenantCaches } "../../utils/cache.ts"

/**
 * Billing snapshot created
 */
eventBus.on(
    DomainEvent.BILLING_SNAPSHOT_CREATED,
    async ({ tenantUuid }) => {
        await invalidateAdminDashboards();
        await invalidateTenantCaches(tenantUuid);
    }
);

/**
 * Invoice created
 */
eventBus.on(
    DomainEvent.INVOICE_CREATED,
    async ({ tenantUuid }) =>{
        await invalidateAdminDashboards();
        await invalidateTenantCaches(tenantUuid);
    }
);

/**
 * Invoice paid
*/
eventBus.on(
    DomainEvent.INVOICE_PAID,
    async ({ tenantUuid }) => {
      await invalidateAdminDashboards();
      await invalidateTenantCaches(tenantUuid);
    }
);

/**
 * Subscription updates
*/
eventBus.on(
    DomainEvent.SUBSCRIPTION_UPDATED,
    async ({ tenantUuid }) => {
      await invalidateAdminDashboards();
      await invalidateTenantCaches(tenantUuid);
    }
);