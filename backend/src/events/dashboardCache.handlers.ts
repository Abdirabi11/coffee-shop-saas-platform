import { eventBus } from "./eventBus.ts";
import { logWithContext } from "../infrastructure/observability/Logger.ts";
import { StoreDashboardService } from "../services/Dashboards/StoreDashboard.service.ts";
import { StaffDashboardService } from "../services/Dashboards/CashierDashboard.service.ts";
import { TenantDashboardService } from "../services/tenant/TenantDashboard.service.ts";

// Drops cached dashboards when the numbers on them change. Each dashboard
// key carries a version (cacheVersion.ts); bumping it makes the next read
// rebuild, and the old entries age out with their TTL.
//
//   money moved (payment confirmed, cashier payment, refund, void)
//       -> the store's, its staff's and the tenant's dashboards
//   order completed or cancelled -> the same
//   any other status change -> the store's active orders and overview
//       (tenant dashboards' active-order counts refresh within their TTL)

type Scope = { tenantUuid?: string; storeUuid?: string };

async function invalidate(event: string, { tenantUuid, storeUuid }: Scope, tenant: boolean) {
    try {
        await Promise.all([
            storeUuid && StoreDashboardService.invalidate(storeUuid),
            storeUuid && tenant && StaffDashboardService.invalidate(storeUuid),
            tenantUuid && tenant && TenantDashboardService.invalidate(tenantUuid),
        ]);
    } catch (error: any) {
        // Redis unreachable: entries expire with their TTL
        logWithContext("warn", "[DashboardCache] Invalidation failed", { event, tenantUuid, storeUuid, error: error.message });
    }
}

const MONEY_EVENTS = ["PAYMENT_CONFIRMED", "CASHIER_PAYMENT_COMPLETED", "REFUND_COMPLETED", "PAYMENT_VOIDED"];
const SETTLED_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

export function registerDashboardCacheHandlers() {
    for (const event of MONEY_EVENTS) {
        eventBus.on(event, (payload) => invalidate(event, payload, true));
    }
    eventBus.on("ORDER_STATUS_CHANGED", (payload) =>
        invalidate("ORDER_STATUS_CHANGED", payload, SETTLED_STATUSES.has(payload.to))
    );
}
