import { registerInventoryEventHandlers } from "./inventory.handlers.ts";

// Single place where event listeners are switched on at startup. Only
// listeners that have been reviewed against the current order/payment flow
// belong here.
//
// Deliberately NOT registered (review before adding):
// - events/order.events.ts and handlers/order/order.handlers.ts register at
//   import time. Their PAYMENT_CONFIRMED / PAYMENT_FAILED listeners move the
//   order to PAID / PAYMENT_FAILED, which PaymentService already does inside
//   its transaction (FinalizeOrderJob would also re-commit stock).
// - payment.handlers.ts, paymentDashboard.handlers.ts, tier2.handlers.ts,
//   superAdminDashboard.handler.ts: metrics, notifications, settlement and
//   cache listeners that have never run in production.
let registered = false;

export function registerEventHandlers() {
    if (registered) return; // EventBus.on appends; registering twice doubles every side effect
    registered = true;

    registerInventoryEventHandlers();
}
