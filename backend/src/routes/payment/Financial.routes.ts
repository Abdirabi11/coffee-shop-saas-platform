import express from "express"
import { authenticate, authorize, authorizeOrder, storeOf, type StoreResolver } from "../../middlewares/auth.middleware.ts";
import { requireTenantContext } from "../../middlewares/requireTenantContext.middleware.ts";
import { ReconciliationDashboardController } from "../../controllers/dashboards/ReconciliationDashboard.controller.ts";
import { CashDrawerReportController } from "../../controllers/dashboards/CashDrawerReport.controller.ts";
import { ReceiptController } from "../../controllers/payments/Receipt.controller.ts";
import { SettlementController } from "../../controllers/payments/Settlement.controller.ts";
import { RevenueForecastController } from "../../controllers/dashboards/RevenueForecast.controller.ts";
import { FinancialReportController } from "../../controllers/dashboards/FinancialReport.controller.ts";
import { TaxTrackingController } from "../../controllers/dashboards/TaxTracking.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";


const router = express.Router();
 
// Tenant-wide reports: tenant-level admins only. Store roles never count here
// (authorize is tenant scope), so a store MANAGER/ADMIN can't read tenant-wide
// figures by sending its own storeUuid.
const tenantAdmin = [authenticate, requireTenantContext, authorize("ADMIN", "TENANT_ADMIN")];

// Store-level reports under /stores/:storeUuid: the role at that store
const storeManagerUp = [authenticate, requireTenantContext, checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"])];

// Routes on one record: the role at that record's own store
const managerAt = (storeFrom: StoreResolver) =>
    [authenticate, requireTenantContext, checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"], storeFrom)];
 
// ══════════════════════════════════════════════════════════════════════════
//  RECONCILIATION
// ══════════════════════════════════════════════════════════════════════════
 
// Tenant-wide reconciliation overview
router.get(
    "/reconciliation/overview",
    ...tenantAdmin,
    ReconciliationDashboardController.getOverview
);
 
// Store daily reconciliation report
router.get(
    "/reconciliation/stores/:storeUuid/daily",
    ...storeManagerUp,
    ReconciliationDashboardController.getDailyReport
);
 
// Store reconciliation history
router.get(
    "/reconciliation/stores/:storeUuid/history",
    ...storeManagerUp,
    ReconciliationDashboardController.getHistory
);
 
// Unresolved reconciliation variances
router.get(
    "/reconciliation/unresolved",
    ...tenantAdmin,
    ReconciliationDashboardController.getUnresolved
);
 
// Resolve a reconciliation variance
router.post(
    "/reconciliation/:reconciliationUuid/resolve",
    ...managerAt(storeOf.record("dailyReconciliation", "reconciliationUuid")),
    ReconciliationDashboardController.resolveVariance
);
 
// Provider reconciliation (Stripe/EVC vs internal)
router.get(
    "/reconciliation/provider",
    ...tenantAdmin,
    ReconciliationDashboardController.getProviderReconciliation
);
 
// Today's reconciliation metrics
router.get(
    "/reconciliation/metrics/today",
    ...tenantAdmin,
    ReconciliationDashboardController.getTodayMetrics
);
 
// ══════════════════════════════════════════════════════════════════════════
//  CASH DRAWER REPORTS
// ══════════════════════════════════════════════════════════════════════════
 
// Shift report for a specific drawer session
router.get(
    "/drawer-reports/:drawerUuid/shift",
    ...managerAt(storeOf.record("cashDrawer", "drawerUuid")),
    CashDrawerReportController.getShiftReport
);
 
// Drawer session history for a store
router.get(
    "/drawer-reports/stores/:storeUuid/sessions",
    ...storeManagerUp,
    CashDrawerReportController.getSessionHistory
);
 
// Terminal performance for a store
router.get(
    "/drawer-reports/stores/:storeUuid/terminals",
    ...storeManagerUp,
    CashDrawerReportController.getTerminalPerformance
);
 
// Daily drawer summary for a store
router.get(
    "/drawer-reports/stores/:storeUuid/daily",
    ...storeManagerUp,
    CashDrawerReportController.getDailySummary
);
 
// ══════════════════════════════════════════════════════════════════════════
//  RECEIPTS
// ══════════════════════════════════════════════════════════════════════════
 
// Customer gets their own receipt by order. authorizeOrder: the order must be
// in this tenant, and the caller must be its customer or staff at its store
// (the handler looks the receipt up by orderUuid alone).
router.get(
    "/receipts/order/:orderUuid",
    authenticate,
    requireTenantContext,
    authorizeOrder("CUSTOMER", "CASHIER", "MANAGER", "ADMIN", "TENANT_ADMIN"),
    ReceiptController.getByOrder
);
 
// Staff gets receipt by payment UUID
router.get(
    "/receipts/payment/:paymentUuid",
    ...managerAt(storeOf.payment()),
    ReceiptController.getByPayment
);
 
// Resend receipt to customer
router.post(
    "/receipts/:paymentUuid/resend",
    ...managerAt(storeOf.payment()),
    ReceiptController.resend
);
 
// ══════════════════════════════════════════════════════════════════════════
//  TAX TRACKING
// ══════════════════════════════════════════════════════════════════════════
 
// Tax summary (total collected, by rate, by category)
router.get(
    "/tax/summary",
    ...tenantAdmin,
    TaxTrackingController.getSummary
);
 
// Monthly tax trend
router.get(
    "/tax/monthly",
    ...tenantAdmin,
    TaxTrackingController.getMonthlyTrend
);
 
// Tax breakdown by payment method
router.get(
    "/tax/by-method",
    ...tenantAdmin,
    TaxTrackingController.getByPaymentMethod
);
 
// Net tax liability
router.get(
    "/tax/liability",
    ...tenantAdmin,
    TaxTrackingController.getNetLiability
);
 
// ══════════════════════════════════════════════════════════════════════════
//  FINANCIAL REPORTS (downloadable)
// ══════════════════════════════════════════════════════════════════════════
 
// Generate daily sales report
router.post(
    "/reports/daily-sales",
    ...tenantAdmin,
    FinancialReportController.generateDailySales
);
 
// Generate drawer summary report
router.post(
    "/reports/drawer-summary",
    ...tenantAdmin,
    FinancialReportController.generateDrawerSummary
);
 
// Generate monthly P&L report
router.post(
    "/reports/monthly-pl",
    ...tenantAdmin,
    FinancialReportController.generateMonthlyPL
);
 
// ══════════════════════════════════════════════════════════════════════════
//  REVENUE FORECASTING
// ══════════════════════════════════════════════════════════════════════════
 
// Revenue projection (next N days)
router.get(
    "/forecast/projection",
    ...tenantAdmin,
    RevenueForecastController.getProjection
);
 
// Year-over-year comparison
router.get(
    "/forecast/yoy",
    ...tenantAdmin,
    RevenueForecastController.getYearOverYear
);
 
// Revenue velocity (daily/weekly run rate)
router.get(
    "/forecast/velocity",
    ...tenantAdmin,
    RevenueForecastController.getVelocity
);
 
// Forecast summary dashboard
router.get(
    "/forecast/summary",
    ...tenantAdmin,
    RevenueForecastController.getSummary
);
 
// ══════════════════════════════════════════════════════════════════════════
//  SETTLEMENT TRACKING
// ══════════════════════════════════════════════════════════════════════════
 
// Settlement dashboard overview
router.get(
    "/settlements/dashboard",
    ...tenantAdmin,
    SettlementController.getDashboard
);
 
// Settlement history
router.get(
    "/settlements/history",
    ...tenantAdmin,
    SettlementController.getHistory
);
 
// Pending settlements
router.get(
    "/settlements/pending",
    ...tenantAdmin,
    SettlementController.getPending
);
 
export default router;