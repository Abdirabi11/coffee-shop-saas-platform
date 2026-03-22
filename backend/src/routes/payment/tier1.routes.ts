import express from "express"
import { authenticate } from "../../middlewares/auth.middleware.ts";
import { ReconciliationDashboardController } from "../../controllers/dashboards/ReconciliationDashboard.controller.ts";
import { CashDrawerReportController } from "../../controllers/dashboards/CashDrawerReport.controller.ts";
import { ReceiptController } from "../../controllers/payments/Receipt.controller.ts";
import { SettlementController } from "../../controllers/payments/Settlement.controller.ts";
import { RevenueForecastController } from "../../controllers/dashboards/RevenueForecast.controller.ts";
import { FinancialReportController } from "../../controllers/dashboards/FinancialReport.controller.ts";
import { TaxTrackingController } from "../../controllers/dashboards/TaxTracking.controller.ts";


const router = express.Router();

router.get(
    "/reconciliation/overview",
    authenticate,
    checkRole(["ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getOverview
);
 
router.get(
    "/reconciliation/stores/:storeUuid/daily",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getDailyReport
);
 
router.get(
    "/reconciliation/stores/:storeUuid/history",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getHistory
);
 
router.get(
    "/reconciliation/unresolved",
    authenticate,
    checkRole(["ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getUnresolved
);
 
router.post(
    "/reconciliation/:reconciliationUuid/resolve",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.resolveVariance
);
 
router.get(
    "/reconciliation/provider",
    authenticate,
    checkRole(["ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getProviderReconciliation
);
 
router.get(
    "/reconciliation/metrics/today",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReconciliationDashboardController.getTodayMetrics
);
 
// ── Cash Drawer Reports (MANAGER+)
 
router.get(
    "/drawer-reports/:drawerUuid/shift",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    CashDrawerReportController.getShiftReport
);
 
router.get(
    "/drawer-reports/stores/:storeUuid/sessions",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    CashDrawerReportController.getSessionHistory
);
 
router.get(
    "/drawer-reports/stores/:storeUuid/terminals",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    CashDrawerReportController.getTerminalPerformance
);
 
router.get(
    "/drawer-reports/stores/:storeUuid/daily",
    authenticate,
    checkRole(["MANAGER", "ADMIN", "TENANT_ADMIN"]),
    CashDrawerReportController.getDailySummary
);
 
// ── Receipts 
 
// Customer can access their own receipt
router.get( "/receipts/order/:orderUuid", authenticate, ReceiptController.getByOrder );
 
// Staff can access any receipt
router.get(
    "/receipts/payment/:paymentUuid",
    authenticate,
    checkRole(["CASHIER", "MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReceiptController.getByPayment
);
 
// Staff can resend receipt to customer
router.post(
    "/receipts/:paymentUuid/resend",
    authenticate,
    checkRole(["CASHIER", "MANAGER", "ADMIN", "TENANT_ADMIN"]),
    ReceiptController.resend
);

router.get("/tax/summary", ...adminOnly, TaxTrackingController.getSummary);
router.get("/tax/monthly", ...adminOnly, TaxTrackingController.getMonthlyTrend);
router.get("/tax/by-method", ...adminOnly, TaxTrackingController.getByPaymentMethod);
router.get("/tax/liability", ...adminOnly, TaxTrackingController.getNetLiability);
 
// ── Financial Reports (ADMIN only — downloadable) ───────────────────────
 
router.post("/reports/daily-sales", ...adminOnly, FinancialReportController.generateDailySales);
router.post("/reports/drawer-summary", ...adminOnly, FinancialReportController.generateDrawerSummary);
router.post("/reports/monthly-pl", ...adminOnly, FinancialReportController.generateMonthlyPL);
 
// ── Revenue Forecasting (MANAGER+ for store, ADMIN for tenant) ──────────
 
router.get("/forecast/projection", ...managerUp, RevenueForecastController.getProjection);
router.get("/forecast/yoy", ...managerUp, RevenueForecastController.getYearOverYear);
router.get("/forecast/velocity", ...managerUp, RevenueForecastController.getVelocity);
router.get("/forecast/summary", ...managerUp, RevenueForecastController.getSummary);
 
// ── Settlement Tracking (ADMIN only) ────────────────────────────────────
 
router.get("/settlements/dashboard", ...adminOnly, SettlementController.getDashboard);
router.get("/settlements/history", ...adminOnly, SettlementController.getHistory);
router.get("/settlements/pending", ...adminOnly, SettlementController.getPending);
 

export default router;