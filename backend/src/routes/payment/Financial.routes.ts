import express from "express"
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { ReconciliationDashboardController } from "../../controllers/dashboards/ReconciliationDashboard.controller.ts";
import { CashDrawerReportController } from "../../controllers/dashboards/CashDrawerReport.controller.ts";
import { ReceiptController } from "../../controllers/payments/Receipt.controller.ts";
import { SettlementController } from "../../controllers/payments/Settlement.controller.ts";
import { RevenueForecastController } from "../../controllers/dashboards/RevenueForecast.controller.ts";
import { FinancialReportController } from "../../controllers/dashboards/FinancialReport.controller.ts";
import { TaxTrackingController } from "../../controllers/dashboards/TaxTracking.controller.ts";
import { checkRole } from "../../middlewares/checkRole.middleware.ts";


const router = express.Router();
 
const adminOnly = [authenticate, checkRole(["ADMIN", "TENANT_ADMIN"])];
const managerUp = [authenticate, checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"])];
 
// ══════════════════════════════════════════════════════════════════════════
//  RECONCILIATION
// ══════════════════════════════════════════════════════════════════════════
 
// Tenant-wide reconciliation overview
router.get(
    "/reconciliation/overview",
    ...adminOnly,
    ReconciliationDashboardController.getOverview
);
 
// Store daily reconciliation report
router.get(
    "/reconciliation/stores/:storeUuid/daily",
    ...managerUp,
    ReconciliationDashboardController.getDailyReport
);
 
// Store reconciliation history
router.get(
    "/reconciliation/stores/:storeUuid/history",
    ...managerUp,
    ReconciliationDashboardController.getHistory
);
 
// Unresolved reconciliation variances
router.get(
    "/reconciliation/unresolved",
    ...adminOnly,
    ReconciliationDashboardController.getUnresolved
);
 
// Resolve a reconciliation variance
router.post(
    "/reconciliation/:reconciliationUuid/resolve",
    ...managerUp,
    ReconciliationDashboardController.resolveVariance
);
 
// Provider reconciliation (Stripe/EVC vs internal)
router.get(
    "/reconciliation/provider",
    ...adminOnly,
    ReconciliationDashboardController.getProviderReconciliation
);
 
// Today's reconciliation metrics
router.get(
    "/reconciliation/metrics/today",
    ...managerUp,
    ReconciliationDashboardController.getTodayMetrics
);
 
// ══════════════════════════════════════════════════════════════════════════
//  CASH DRAWER REPORTS
// ══════════════════════════════════════════════════════════════════════════
 
// Shift report for a specific drawer session
router.get(
    "/drawer-reports/:drawerUuid/shift",
    ...managerUp,
    CashDrawerReportController.getShiftReport
);
 
// Drawer session history for a store
router.get(
    "/drawer-reports/stores/:storeUuid/sessions",
    ...managerUp,
    CashDrawerReportController.getSessionHistory
);
 
// Terminal performance for a store
router.get(
    "/drawer-reports/stores/:storeUuid/terminals",
    ...managerUp,
    CashDrawerReportController.getTerminalPerformance
);
 
// Daily drawer summary for a store
router.get(
    "/drawer-reports/stores/:storeUuid/daily",
    ...managerUp,
    CashDrawerReportController.getDailySummary
);
 
// ══════════════════════════════════════════════════════════════════════════
//  RECEIPTS
// ══════════════════════════════════════════════════════════════════════════
 
// Customer gets their own receipt by order
router.get(
    "/receipts/order/:orderUuid",
    authenticate,
    ReceiptController.getByOrder
);
 
// Staff gets receipt by payment UUID
router.get(
    "/receipts/payment/:paymentUuid",
    ...managerUp,
    ReceiptController.getByPayment
);
 
// Resend receipt to customer
router.post(
    "/receipts/:paymentUuid/resend",
    ...managerUp,
    ReceiptController.resend
);
 
// ══════════════════════════════════════════════════════════════════════════
//  TAX TRACKING
// ══════════════════════════════════════════════════════════════════════════
 
// Tax summary (total collected, by rate, by category)
router.get(
    "/tax/summary",
    ...adminOnly,
    TaxTrackingController.getSummary
);
 
// Monthly tax trend
router.get(
    "/tax/monthly",
    ...adminOnly,
    TaxTrackingController.getMonthlyTrend
);
 
// Tax breakdown by payment method
router.get(
    "/tax/by-method",
    ...adminOnly,
    TaxTrackingController.getByPaymentMethod
);
 
// Net tax liability
router.get(
    "/tax/liability",
    ...adminOnly,
    TaxTrackingController.getNetLiability
);
 
// ══════════════════════════════════════════════════════════════════════════
//  FINANCIAL REPORTS (downloadable)
// ══════════════════════════════════════════════════════════════════════════
 
// Generate daily sales report
router.post(
    "/reports/daily-sales",
    ...adminOnly,
    FinancialReportController.generateDailySales
);
 
// Generate drawer summary report
router.post(
    "/reports/drawer-summary",
    ...adminOnly,
    FinancialReportController.generateDrawerSummary
);
 
// Generate monthly P&L report
router.post(
    "/reports/monthly-pl",
    ...adminOnly,
    FinancialReportController.generateMonthlyPL
);
 
// ══════════════════════════════════════════════════════════════════════════
//  REVENUE FORECASTING
// ══════════════════════════════════════════════════════════════════════════
 
// Revenue projection (next N days)
router.get(
    "/forecast/projection",
    ...managerUp,
    RevenueForecastController.getProjection
);
 
// Year-over-year comparison
router.get(
    "/forecast/yoy",
    ...managerUp,
    RevenueForecastController.getYearOverYear
);
 
// Revenue velocity (daily/weekly run rate)
router.get(
    "/forecast/velocity",
    ...managerUp,
    RevenueForecastController.getVelocity
);
 
// Forecast summary dashboard
router.get(
    "/forecast/summary",
    ...managerUp,
    RevenueForecastController.getSummary
);
 
// ══════════════════════════════════════════════════════════════════════════
//  SETTLEMENT TRACKING
// ══════════════════════════════════════════════════════════════════════════
 
// Settlement dashboard overview
router.get(
    "/settlements/dashboard",
    ...adminOnly,
    SettlementController.getDashboard
);
 
// Settlement history
router.get(
    "/settlements/history",
    ...adminOnly,
    SettlementController.getHistory
);
 
// Pending settlements
router.get(
    "/settlements/pending",
    ...adminOnly,
    SettlementController.getPending
);
 
export default router;