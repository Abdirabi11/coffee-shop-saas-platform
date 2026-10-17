import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Platform invoicing and its enforcement are switched off.
//
// Nothing can pay a platform invoice yet: no checkout/provider flow, no
// "mark paid" route, and the super-admin routes are not mounted. With these
// jobs running, every invoice would go OVERDUE after 30 days and
// suspendOverdueTenants would then lock each tenant out (requireTenantContext
// answers TENANT_SUSPENDED to every request), with no way back in.
//
// A code constant rather than an env var on purpose: turning this on must be
// a reviewed change that ships together with a working payment path, an
// un-suspend path, and correct invoice amounts (interval, trials, cancelled
// subscriptions).
export const BILLING_ENFORCEMENT_ENABLED = false;

// Call first in every invoicing/enforcement job; returns true if it may run
export function billingEnforcementEnabled(job: string): boolean {
    if (!BILLING_ENFORCEMENT_ENABLED) {
        logWithContext("warn", "[Billing] Job skipped: billing enforcement is disabled", { job });
        return false;
    }
    return true;
}
