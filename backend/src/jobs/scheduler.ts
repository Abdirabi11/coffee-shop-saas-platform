import cron from "node-cron";
import { trackJobExecution } from "../lib/jobMonitor.ts";
import { PaymentExpiryCleanupJob } from "./Payment/PaymentExpiryCleanup.job.ts";
import { DashboardCacheWarmingJob } from "./dashboard/dashboardCacheWarming.Job.ts";
import { ShiftReminderJob } from "./staff/ShiftReminder.job.ts";
import { OrderExpiryCleanupJobs } from "./Order/orderExpiryCleanup.jobs.ts";
import { AutoCancelOrdersJob } from "./Order/autoCancelOrders.job.ts";
import { AutoCompleteOrdersJob } from "./Order/autoCompleteOrders.job.ts";
import { ReservationExpiryJob } from "./Inventory/ReservationExpiry.job.ts";
import { PaymentPollingReconciliationJob } from "./Payment/PaymentPollingReconciliation.ts";
import { RefundProcessorJob } from "./Payment/RefundProcessor.job.ts";
import { DetectStuckOrdersJob } from "./Order/detectStuckOrders.job.ts";
import { BreakEnforcementMonitorJob } from "./staff/BreakEnforcementMonitor.job.ts";
import { WebhookMonitoringJob } from "./webhook/WebhookMonitoring.job.ts";
import { WebhookRetryJob } from "./webhook/WebhookRetry.job.ts";
import { MissedShiftTrackerJob } from "./staff/MissedShiftTracker.job.ts";
import { OrderTimeoutAlertJob } from "./Order/orderTimeoutAlert.job.ts";
import { PaymentRetryJob } from "./Payment/PaymentRetry.job.ts";
import { SessionCleanupJob } from "./auth/SessionCleanup.job.ts";
import { QuotaResetJob } from "./Billing/QuotaReset.job.ts";
import { MonthlyRevenueJob } from "./Analytics/monthlyRevenue.job.ts";
import { GenerateBillingSnapshotsJob } from "./Analytics/generateBillingSnapshots.job.ts";
import { CommissionCalculationJob } from "./staff/CommissionCalculation.job.ts";
import { DashboardSnapshotCleanupJob } from "./dashboard/dashboardSnapshotCleanup.job.ts";
import { OTPCleanupJob } from "./auth/OTPCleanup.job.ts";
import { LowStockCheckJob } from "./Inventory/LowStockCheck.job.ts";
import { AutoClockOutJob } from "./staff/AutoClockOut.job.ts";
import { HourlyRevenueJob } from "./Order/hourlyRevenue.job.ts";
import { LowStockAlertJob } from "./Product/lowStockAlert.job.ts";
import { LaborCostSnapshotJob } from "./staff/LaborCostSnapshot.job.ts";
import { AnomalyReviewJob } from "./Payment/AnomalyReview.job.ts";
import { CashDrawerReminderJob } from "./Payment/CashDrawerReminder.job.ts";
import { MenuCacheWarmupJob } from "./Product/menuCacheWarmup.job.ts";
import { TipPoolCalculationJob } from "./staff/TipPoolCalculation.job.ts";
import { AnalyticsAggregationJob } from "./Analytics/AnalyticsAggregation.job.ts";
import { SubscriptionRenewalJob } from "./Billing/SubscriptionRenewal.job.ts";
import { markOverdueInvoices } from "./Billing/markOverdueInvoices.job.ts";
import { DailyReconciliationJob } from "./Payment/DailyReconciliation.job.ts";
import { PerformanceCalculationJob } from "./staff/PerformanceCalculation.job.ts";
import { MenuSnapshotJob } from "./menu/MenuSnapshot.job.ts";
import { ProductPopularityJob } from "./Order/productPopularity.job.ts";
import { ProductMetricsCalculationJob } from "./Product/productMetricsCalculation.job.ts";
import { AnalyticsSnapshotCleanupJob } from "./Analytics/Analyticssnapshotcleanup.job.ts";



function schedule(cronExpr: string, jobName: string, fn: () => Promise<void>) {
  cron.schedule(cronExpr, async () => {
    try {
      await trackJobExecution(jobName, fn);
    } catch (error: any) {
      console.error(`[CRON] ${jobName} failed:`, error.message);
    }
  });
}

export function startScheduler() {
  console.log("🕒 Starting scheduler...");
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 EVERY 5 MINUTES (real-time operations)
  // ─────────────────────────────────────────────────────────────────────────
 
  // schedule("*/5 * * * *", "PaymentTimeoutJob",              () => PaymentTimeoutJob.run());
  schedule("*/5 * * * *", "PaymentExpiryCleanupJob",        () => PaymentExpiryCleanupJob.run());
  schedule("*/5 * * * *", "PaymentPollingReconciliation",   () => PaymentPollingReconciliationJob.run());
  schedule("*/5 * * * *", "ReservationExpiryJob",           () => ReservationExpiryJob.run());
  schedule("*/5 * * * *", "AutoCompleteOrdersJob",          () => AutoCompleteOrdersJob.run());
  schedule("*/5 * * * *", "AutoCancelOrdersJob",            () => AutoCancelOrdersJob.run());
  schedule("*/5 * * * *", "OrderExpiryCleanupJob",          () => OrderExpiryCleanupJobs.run());
  schedule("*/5 * * * *", "ShiftReminderJob",               () => ShiftReminderJob.run());
  schedule("*/5 * * * *", "DashboardCacheWarmingJob",       () => DashboardCacheWarmingJob.execute());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟡 EVERY 10 MINUTES
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("*/10 * * * *", "RefundProcessorJob",            () => RefundProcessorJob.run());
  schedule("*/10 * * * *", "DetectStuckOrdersJob",          () => DetectStuckOrdersJob.run());
  schedule("*/10 * * * *", "BreakEnforcementMonitorJob",    () => BreakEnforcementMonitorJob.run());
  schedule("*/10 * * * *", "WebhookMonitoringJob",          () => WebhookMonitoringJob.run());
  // schedule("*/10 * * * *", "prewarmDashboards",             () => prewarmDashboards());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟡 EVERY 15 MINUTES
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("*/15 * * * *", "WebhookRetryJob",               () => WebhookRetryJob.run());
  schedule("*/15 * * * *", "MissedShiftTrackerJob",         () => MissedShiftTrackerJob.run());
  schedule("*/15 * * * *", "OrderTimeoutAlertJob",          () => OrderTimeoutAlertJob.run());
  // schedule("*/15 * * * *", "MenuCacheWarmingJob",           () => MenuCacheWarmingJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟡 EVERY 30 MINUTES
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("*/30 * * * *", "PaymentRetryJob",               () => PaymentRetryJob.run());
  schedule("*/30 * * * *", "LowStockCheckJob",              () => LowStockCheckJob.run());
  schedule("*/30 * * * *", "OTPCleanupJob",                 () => OTPCleanupJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟢 EVERY HOUR
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("0 * * * *",  "SessionCleanupJob",               () => SessionCleanupJob.run());
  schedule("0 * * * *",  "AutoClockOutJob",                 () => AutoClockOutJob.run());
  schedule("0 * * * *",  "LaborCostSnapshotJob",            () => LaborCostSnapshotJob.run());
  schedule("0 * * * *",  "LowStockAlertJob",                () => LowStockAlertJob.run());
  schedule("5 * * * *",  "HourlyRevenueJob",                () => HourlyRevenueJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟢 EVERY FEW HOURS
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("0 */2 * * *", "AnomalyReviewJob",               () => AnomalyReviewJob.run());
  schedule("0 */6 * * *", "CashDrawerReminderJob",          () => CashDrawerReminderJob.run());
  schedule("0 */6 * * *", "MenuCacheWarmupJob",             () => MenuCacheWarmupJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🔵 DAILY (nightly batch window: 00:00–05:00)
  // ─────────────────────────────────────────────────────────────────────────
 
  // 00:00 — Quota resets
  schedule("0 0 * * *",  "QuotaResetJob.daily",             () => QuotaResetJob.runDaily());
 
  // 01:00 — Subscriptions & tips
  schedule("0 1 * * *",  "SubscriptionRenewalJob",          () => SubscriptionRenewalJob.run());
  schedule("0 1 * * *",  "TipPoolCalculationJob",           () => TipPoolCalculationJob.run());
  schedule("0 1 * * *",  "markOverdueInvoices",             () => markOverdueInvoices());
  schedule("0 1 * * *",  "AnalyticsAggregationJob",         () => AnalyticsAggregationJob.run());
 
  // 02:00 — Reconciliation & metrics
  schedule("0 2 * * *",  "DailyReconciliationJob",          () => DailyReconciliationJob.run());
  schedule("0 2 * * *",  "DailyStoreMetricsJob",            () => DailyStoreMetricsJob.run());
  schedule("0 2 * * *",  "PerformanceCalculationJob",       () => PerformanceCalculationJob.run());
  schedule("0 2 * * *",  "ProductMetricsCalculationJob",    () => ProductMetricsCalculationJob.run());
  schedule("0 2 * * *",  "MenuSnapshotJob",                 () => MenuSnapshotJob.run());
  schedule("0 2 * * *",  "suspendOverdueTenants",           () => suspendOverdueTenants());
  schedule("0 2 * * *",  "InventoryReconciliationJob",      () => InventoryReconciliationJob.run());
  schedule("30 2 * * *", "ProductPopularityJob",            () => ProductPopularityJob.runDaily());
  schedule("30 2 * * *", "DashboardSnapshotJob",            () => DashboardSnapshotJob.execute());
 
  // 03:00 — Provider reconciliation & analytics
  schedule("0 3 * * *",  "ProviderReportReconciliation",    () => ProviderReportReconciliationJob.run());
  schedule("0 3 * * *",  "OrderMetricsCalculationJob",      () => OrderMetricsCalculationJob.run());
  schedule("0 3 * * *",  "DeviceCleanupJob",                () => DeviceCleanupJob.run());
  schedule("0 3 * * *",  "MenuAnalyticsAggregationJob",     () => MenuAnalyticsAggregationJob.run());
  schedule("0 3 * * *",  "WebhookCleanupJob",               () => WebhookCleanupJob.run());
  schedule("0 3 * * *",  "StaleOrderMetricsJob",            () => StaleOrderMetricsJob.runDaily());
  schedule("0 3 * * *",  "ChurnAnalyticsJob",               () => ChurnAnalyticsJob.run());
  schedule("30 3 * * *", "IdempotencyKeyCleanupJob",        () => IdempotencyKeyCleanupJob.run());
  schedule("30 3 * * *", "CohortRetentionJob",              () => CohortRetentionJob.run());
  schedule("45 3 * * *", "TenantCohortGrowthJob",           () => TenantCohortGrowthJob.run());
 
  // 04:00 — Cleanup & decay
  schedule("0 4 * * *",  "RiskScoreDecayJob",               () => RiskScoreDecayJob.run());
  schedule("0 4 * * *",  "FraudEventCleanupJob",            () => FraudEventCleanupJob.run());
  schedule("0 4 * * *",  "IdempotencyService.cleanup",      () => IdempotencyService.cleanup());
  schedule("15 4 * * *", "ArpuLtvJob",                      () => ArpuLtvJob.run());
 
  // 05:00 — Orphaned detection
  schedule("0 5 * * *",  "OrphanedPaymentDetectionJob",     () => OrphanedPaymentDetectionJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟣 WEEKLY
  // ─────────────────────────────────────────────────────────────────────────
 
  // Sunday 4:00 AM — Snapshot cleanup
  schedule("0 4 * * 0",  "SnapshotCleanupJob",              () => SnapshotCleanupJob.run());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟣 MONTHLY (1st of month)
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("0 0 1 * *",  "generateMonthlyInvoices",         () => generateMonthlyInvoices());
  schedule("0 0 1 * *",  "QuotaResetJob.monthly",           () => QuotaResetJob.runMonthly());
  schedule("30 0 1 * *", "MonthlyRevenueJob",               () => MonthlyRevenueJob.run());
  schedule("0 1 1 * *",  "GenerateBillingSnapshotsJob",     () => GenerateBillingSnapshotsJob.run());
  schedule("0 2 1 * *",  "DashboardSnapshotCleanupJob",     () => DashboardSnapshotCleanupJob.execute());
  schedule("0 3 1 * *",  "CommissionCalculationJob",        () => CommissionCalculationJob.run());
  schedule("0 3 1 * *",  "AnalyticsSnapshotCleanupJob",     () => AnalyticsSnapshotCleanupJob.execute());
 
  // ─────────────────────────────────────────────────────────────────────────
  // 🟣 YEARLY (January 1st)
  // ─────────────────────────────────────────────────────────────────────────
 
  schedule("0 0 1 1 *",  "QuotaResetJob.yearly",            () => QuotaResetJob.runYearly());
 

  console.log("✅ Scheduler started — 69 jobs registered");
  console.log("  ⚡ Every 5 min:   9 jobs (payments, orders, inventory, shifts, cache)");
  console.log("  🔄 Every 10 min:  5 jobs (refunds, stuck orders, breaks, webhooks, dashboards)");
  console.log("  🔄 Every 15 min:  4 jobs (webhooks, shifts, orders, menu cache)");
  console.log("  🔄 Every 30 min:  3 jobs (payment retry, stock check, OTP cleanup)");
  console.log("  ⏰ Every hour:    5 jobs (sessions, clock-out, labor, stock alerts, revenue)");
  console.log("  ⏰ Every 2-6 hr:  3 jobs (anomalies, drawer reminders, menu warmup)");
  console.log("  🌙 Daily:        28 jobs (reconciliation, metrics, analytics, cleanup)");
  console.log("  📅 Weekly:        1 job  (snapshot cleanup)");
  console.log("  📅 Monthly:       7 jobs (invoices, quotas, revenue, billing, commissions)");
  console.log("  📅 Yearly:        1 job  (quota reset)");
}
