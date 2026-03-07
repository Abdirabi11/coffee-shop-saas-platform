import { bumpCacheVersion } from "../cache/cacheVersion.Ts";
import { DomainEvent } from "./event.types.ts";
import { eventBus } from "./eventBus.ts";

eventBus.on(DomainEvent.ORDER_CREATED, async ({ tenantUuid, storeUuid }) => {
    await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
    await bumpCacheVersion(`store:${storeUuid}:dashboard`);
});
  
eventBus.on(DomainEvent.PAYMENT_SUCCESS, async ({ tenantUuid, storeUuid }) => {
    await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
    await bumpCacheVersion(`store:${storeUuid}:dashboard`);
});
  
eventBus.on(DomainEvent.INVOICE_CREATED, async ({ tenantUuid }) => {
    await bumpCacheVersion(`tenant:${tenantUuid}:dashboard`);
});