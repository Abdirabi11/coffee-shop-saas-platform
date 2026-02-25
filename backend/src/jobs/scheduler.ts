import cron from "node-cron";
import { trackJobExecution } from "../lib/jobMonitor.ts";
import { IdempotencyService } from "../services/order/idempotency.service.ts";
import { ArpuLtvJob } from "./analytics/arpuLtv.job.ts";
import { ChurnAnalyticsJob } from "./analytics/churnAnalytics.job.ts";
import { CohortRetentionJob } from "./analytics/cohortRetention.job.ts";
import { GenerateBillingSnapshotsJob } from "./analytics/generateBillingSnapshots.job.ts";
import { MonthlyRevenueJob } from "./analytics/monthlyRevenue.job.ts";
import { TenantCohortGrowthJob } from "./analytics/tenantCohortGrowth.job.ts";
import { generateMonthlyInvoices, markOverdueInvoices, suspendOverdueTenants } from "./billing/generateInvoiceNumber.jobs.ts";
import { prewarmDashboards } from "./dashboardPrewarm.job.ts";
import { AutoCompleteOrdersJob } from "./OrderJobs/autoCompleteOrders.job.ts";
import { AutoCancelOrdersJob } from "./OrderJobs/autoCancelOrders.job.ts";
import { DailyStoreMetricsJob } from "./OrderJobs/dailyStoreMetrics.job.ts";
import { DetectStuckOrdersJob } from "./OrderJobs/detectStuckOrders.job.ts";
import { HourlyRevenueJob } from "./OrderJobs/hourlyRevenue.job.ts";
import { OrderTimeoutAlertJob } from "./OrderJobs/orderTimeoutAlert.job.ts";
import { StaleOrderMetricsJob } from "./OrderJobs/staleOrderMetrics.job.ts";
import { PaymentRetryJob } from "./payment/payment-retry.job.ts";
import { PaymentTimeoutJob } from "./payment/paymentTimeout.job.ts";
import { ProductPopularityJob } from "./OrderJobs/product-popularity.job.ts";
import { DailyReconciliationJob } from "./payment/dailyReconciliation.job.ts";
import { AnomalyReviewJob } from "./payment/anomalyReview.job.ts";
import { CashDrawerReminderJob } from "./payment/cashDrawerReminder.job.ts";
import { PaymentPollingReconciliationJob } from "./payment/paymentPollingReconciliation.ts";
import { ProviderReportReconciliation } from "./payment/providerReportReconciliation.ts";
import { RiskScoreDecayJob } from "./payment/riskScoreDecay.jobs.ts";
import { WebhookRetryJob } from "./webhook/webhookRetry.job.ts";
import { PaymentExpiryCleanupJob } from "./payment/paymentExpiryCleanup.job.ts";
import { OrphanedPaymentDetectionJob } from "./payment/orphanedPaymentDetection.job.ts";
import { IdempotencyKeyCleanupJob } from "./payment/idempotencyKeyCleanup.job.ts";
import { MenuCacheWarmupJob } from "./Product/menuCacheWarmup.job.ts";
import { LowStockAlertJob } from "./Product/lowStockAlert.job.ts";
import { ProductMetricsCalculationJob } from "./Product/productMetricsCalculation.job.ts";
import { OrderExpiryCleanupJobs } from "./Order/orderExpiryCleanup.jobs.ts";
import { OrderMetricsCalculationJob } from "./Order/orderMetricsCalculation.job.ts";



export function startScheduler() {
  console.log("🕒 Scheduler started");

  // 🔴 CRITICAL JOBS (High Frequency)

  // Every 5 minutes - Timeout expired payments
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running PaymentTimeoutJob");
    try {
      await PaymentTimeoutJob.run();
    } catch (error: any) {
      console.error("[CRON] PaymentTimeoutJob failed:", error.message);
    }
  });

  // Every 5 minutes - Clean up expired payments
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running PaymentExpiryCleanupJob");
    try {
      await PaymentExpiryCleanupJob.run();
    } catch (error: any) {
      console.error("[CRON] PaymentExpiryCleanupJob failed:", error.message);
    }
  });

  // Every 5 minutes - Poll stuck payments
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running PaymentPollingReconciliationJob");
    try {
      await PaymentPollingReconciliationJob.run();
    } catch (error: any) {
      console.error("[CRON] PaymentPollingReconciliationJob failed:", error.message);
    }
  });

  // Every 15 minutes - Retry failed webhooks
  cron.schedule("*/15 * * * *", async () => {
    console.log("[CRON] Running WebhookRetryJob");
    try {
      await WebhookRetryJob.run();
    } catch (error: any) {
      console.error("[CRON] WebhookRetryJob failed:", error.message);
    }
  });

  // Every 30 minutes - Retry failed payments
  cron.schedule("*/30 * * * *", async () => {
    console.log("[CRON] Running PaymentRetryJob");
    try {
      await PaymentRetryJob.run();
    } catch (error: any) {
      console.error("[CRON] PaymentRetryJob failed:", error.message);
    }
  });

  // 🟡 PERIODIC JOBS (Every Few Hours)

  // Every 2 hours - Anomaly review alerts
  cron.schedule("0 */2 * * *", async () => {
    console.log("[CRON] Running AnomalyReviewJob");
    try {
      await AnomalyReviewJob.run();
    } catch (error: any) {
      console.error("[CRON] AnomalyReviewJob failed:", error.message);
    }
  });

  // Every 6 hours - Cash drawer reminders
  cron.schedule("0 */6 * * *", async () => {
    console.log("[CRON] Running CashDrawerReminderJob");
    try {
      await CashDrawerReminderJob.run();
    } catch (error: any) {
      console.error("[CRON] CashDrawerReminderJob failed:", error.message);
    }
  });

  // 🟢 DAILY JOBS (Once Per Day)

  // Daily at 2:00 AM - Cash drawer reconciliation
  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running DailyReconciliationJob");
    try {
      await DailyReconciliationJob.run();
    } catch (error: any) {
      console.error("[CRON] DailyReconciliationJob failed:", error.message);
    }
  });

  // Daily at 3:00 AM - Provider report reconciliation
  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running ProviderReportReconciliationJob");
    try {
      await ProviderReportReconciliationJob.run();
    } catch (error: any) {
      console.error("[CRON] ProviderReportReconciliationJob failed:", error.message);
    }
  });

  // Daily at 3:30 AM - Idempotency key cleanup
  cron.schedule("30 3 * * *", async () => {
    console.log("[CRON] Running IdempotencyKeyCleanupJob");
    try {
      await IdempotencyKeyCleanupJob.run();
    } catch (error: any) {
      console.error("[CRON] IdempotencyKeyCleanupJob failed:", error.message);
    }
  });

  // Daily at 4:00 AM - Risk score decay
  cron.schedule("0 4 * * *", async () => {
    console.log("[CRON] Running RiskScoreDecayJob");
    try {
      await RiskScoreDecayJob.run();
    } catch (error: any) {
      console.error("[CRON] RiskScoreDecayJob failed:", error.message);
    }
  });

  // Daily at 5:00 AM - Orphaned payment detection
  cron.schedule("0 5 * * *", async () => {
    console.log("[CRON] Running OrphanedPaymentDetectionJob");
    try {
      await OrphanedPaymentDetectionJob.run();
    } catch (error: any) {
      console.error("[CRON] OrphanedPaymentDetectionJob failed:", error.message);
    }
  });

  console.log("✅ All payment cron jobs scheduled successfully");
  console.log("📊 Scheduler summary:");
  console.log("  - Every 5 min: PaymentTimeout, PaymentExpiryCleanup, PollingReconciliation");
  console.log("  - Every 15 min: WebhookRetry");
  console.log("  - Every 30 min: PaymentRetry");
  console.log("  - Every 2 hours: AnomalyReview");
  console.log("  - Every 6 hours: CashDrawerReminder");
  console.log("  - Daily 2 AM: DailyReconciliation");
  console.log("  - Daily 3 AM: ProviderReconciliation");
  console.log("  - Daily 3:30 AM: IdempotencyCleanup");
  console.log("  - Daily 4 AM: RiskScoreDecay");
  console.log("  - Daily 5 AM: OrphanedPaymentDetection");

  //📦 ORDER JOBS

  // Every 5 minutes - Cancel expired orders
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running OrderExpiryCleanupJob");
    try {
      await OrderExpiryCleanupJobs.run();
    } catch (error) {
      console.error("[CRON] OrderExpiryCleanupJob failed:", error);
    }
  });

  cron.schedule("0 4 * * *", async () => {
    console.log("[CRON] Running IdempotencyKeyCleanupJob");
    try {
      await IdempotencyKeyCleanupJob.run();
    } catch (error) {
      console.error("[CRON] IdempotencyKeyCleanupJob failed:", error);
    }
  });

  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running OrderMetricsCalculationJob");
    try {
      await OrderMetricsCalculationJob.run();
    } catch (error) {
      console.error("[CRON] OrderMetricsCalculationJob failed:", error);
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running AutoCompleteOrdersJob");
    try {
      await AutoCompleteOrdersJob.run();
    } catch (error) {
      console.error("[CRON] AutoCompleteOrdersJob failed:", error);
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running AutoCancelOrdersJob");
    try {
      await AutoCancelOrdersJob.run();
    } catch (error) {
      console.error("[CRON] AutoCancelOrdersJob failed:", error);
    }
  });

  cron.schedule("*/10 * * * *", async () => {
    console.log("[CRON] Running DetectStuckOrdersJob");
    try {
      await DetectStuckOrdersJob.run();
    } catch (error) {
      console.error("[CRON] DetectStuckOrdersJob failed:", error);
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    console.log("[CRON] Running OrderTimeoutAlertJob");
    try {
      await OrderTimeoutAlertJob.run();
    } catch (error) {
      console.error("[CRON] OrderTimeoutAlertJob failed:", error);
    }
  });
     
  cron.schedule("5 * * * *", async () => {
    console.log("[CRON] Running HourlyRevenueJob");
    try {
      await HourlyRevenueJob.run();
    } catch (error) {
      console.error("[CRON] HourlyRevenueJob failed:", error);
    }
  });

  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running DailyStoreMetricsJob");
    try {
      await DailyStoreMetricsJob.run();
    } catch (error) {
      console.error("[CRON] DailyStoreMetricsJob failed:", error);
    }
  });

  cron.schedule("30 2 * * *", async () => {
    console.log("[CRON] Running ProductPopularityJob");
    try {
      await ProductPopularityJob.runDaily();
    } catch (error) {
      console.error("[CRON] ProductPopularityJob failed:", error);
    }
  });
    
  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running StaleOrderMetricsJob");
    try {
      await StaleOrderMetricsJob.runDaily();
    } catch (error) {
      console.error("[CRON] StaleOrderMetricsJob failed:", error);
    }
  });

  // 💳 PAYMENT JOBS    
  cron.schedule("*/30 * * * *", async () => {
    console.log("[CRON] Running PaymentRetryJob");
    try {
      await PaymentRetryJob.run();
    } catch (error) {
      console.error("[CRON] PaymentRetryJob failed:", error);
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running PaymentPollingReconciliationJob");
    try {
      await PaymentPollingReconciliationJob.run();
    } catch (error) {
      console.error("[CRON] PaymentPollingReconciliationJob failed:", error);
    }
  });

  // 📊 RECONCILIATION & REVIEW
 
  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running DailyReconciliationJob");
    try {
      await DailyReconciliationJob.run();
    } catch (error) {
      console.error("[CRON] DailyReconciliationJob failed:", error);
    }
  });

  cron.schedule("0 */2 * * *", async () => {
    console.log("[CRON] Running AnomalyReviewJob");
    try {
      await AnomalyReviewJob.run();
    } catch (error) {
      console.error("[CRON] AnomalyReviewJob failed:", error);
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    console.log("[CRON] Running CashDrawerReminderJob");
    try {
      await CashDrawerReminderJob.run();
    } catch (error) {
      console.error("[CRON] CashDrawerReminderJob failed:", error);
    }
  });

  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running ProviderReportReconciliationJob");
    try {
      await ProviderReportReconciliation.run();
    } catch (error) {
      console.error("[CRON] ProviderReportReconciliationJob failed:", error);
    }
  });

  //Product Jobs

  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running ProductMetricsCalculationJob");
    try {
      await ProductMetricsCalculationJob.run();
    } catch (error) {
      console.error("[CRON] ProductMetricsCalculationJob failed:", error);
    }
  });
  
  // Every 6 hours - Warm up menu cache
  cron.schedule("0 */6 * * *", async () => {
    console.log("[CRON] Running MenuCacheWarmupJob");
    try {
      await MenuCacheWarmupJob.run();
    } catch (error) {
      console.error("[CRON] MenuCacheWarmupJob failed:", error);
    }
  });
  
  // Every hour - Check low stock
  cron.schedule("0 * * * *", async () => {
    console.log("[CRON] Running LowStockAlertJob");
    try {
      await LowStockAlertJob.run();
    } catch (error) {
      console.error("[CRON] LowStockAlertJob failed:", error);
    }
  });

  //🧾 BILLING JOBS
  cron.schedule("0 0 1 * *", async () => {
    console.log("[CRON] Running generateMonthlyInvoices");
    try {
      await generateMonthlyInvoices();
    } catch (error) {
      console.error("[CRON] generateMonthlyInvoices failed:", error);
    }
  });

  cron.schedule("0 1 * * *", async () => {
    console.log("[CRON] Running markOverdueInvoices");
    try {
      await markOverdueInvoices();
    } catch (error) {
      console.error("[CRON] markOverdueInvoices failed:", error);
    }
  });
    
  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running suspendOverdueTenants");
    try {
      await suspendOverdueTenants();
    } catch (error) {
      console.error("[CRON] suspendOverdueTenants failed:", error);
    }
  });

  //Webhook jobs

  cron.schedule("*/15 * * * *", async () => {
    await WebhookRetryJob.run();
  });

  //📊 ANALYTICS JOBS

  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running ChurnAnalyticsJob");
    try {
      await ChurnAnalyticsJob.run();
    } catch (error) {
      console.error("[CRON] ChurnAnalyticsJob failed:", error);
    }
  });

  cron.schedule("30 3 * * *", async () => {
    console.log("[CRON] Running CohortRetentionJob");
    try {
      await CohortRetentionJob.run();
    } catch (error) {
      console.error("[CRON] CohortRetentionJob failed:", error);
    }
  });

  cron.schedule("45 3 * * *", async () => {
    console.log("[CRON] Running TenantCohortGrowthJob");
    try {
      await TenantCohortGrowthJob.run();
    } catch (error) {
      console.error("[CRON] TenantCohortGrowthJob failed:", error);
    }
  });

  cron.schedule("15 4 * * *", async () => {
    console.log("[CRON] Running ArpuLtvJob");
    try {
      await ArpuLtvJob.run();
    } catch (error) {
      console.error("[CRON] ArpuLtvJob failed:", error);
    }
  });

  // Monthly on 1st at 4:30 AM - Generate billing snapshots
  cron.schedule("30 4 1 * *", async () => {
    console.log("[CRON] Running GenerateBillingSnapshotsJob");
    try {
      await GenerateBillingSnapshotsJob.run();
    } catch (error) {
      console.error("[CRON] GenerateBillingSnapshotsJob failed:", error);
    }
  });

  cron.schedule("0 4 * * *", async () => {
    await RiskScoreDecayJob.run();
  });

  //📊 ANALYTICS JOBS

  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running MonthlyRevenueJob");
    try {
      await MonthlyRevenueJob.run();
    } catch (error) {
      console.error("[CRON] MonthlyRevenueJob failed:", error);
    }
  });

  cron.schedule("0 3 * * *", async ()=>{
    console.log("[CRON] Running ChurnAnalyticsJob");
    try {
      await ChurnAnalyticsJob.run();
    } catch (error) {
      console.error("[CRON] ChurnAnalyticsJob failed:", error);
    }
  });

  cron.schedule("30 3 * * *", async () => {
    console.log("[CRON] Running CohortRetentionJob");
    try {
      await CohortRetentionJob.run();
    } catch (error) {
      console.error("[CRON] CohortRetentionJob failed:", error);
    }
  });

  cron.schedule("45 3 * * *", async () => {
    console.log("[CRON] Running TenantCohortGrowthJob");
    try {
      await TenantCohortGrowthJob.run();
    } catch (error) {
      console.error("[CRON] TenantCohortGrowthJob failed:", error);
    }
  });

  cron.schedule("15 4 * * *", async () => {
    console.log("[CRON] Running ArpuLtvJob");
    try {
      await ArpuLtvJob.run();
    } catch (error) {
      console.error("[CRON] ArpuLtvJob failed:", error);
    }
  });

  cron.schedule("30 4 1 * *", async () => {
    console.log("[CRON] Running GenerateBillingSnapshotsJob");
    try {
      await GenerateBillingSnapshotsJob.run();
    } catch (error) {
      console.error("[CRON] GenerateBillingSnapshotsJob failed:", error);
    }
  });

  // 🧹 CLEANUP JOBS
  cron.schedule("0 4 * * *", async () => {
    console.log("[CRON] Running IdempotencyService.cleanup");
    try {
      //double
      await IdempotencyService.cleanup();
    } catch (error) {
      console.error("[CRON] IdempotencyService.cleanup failed:", error);
    }
  });

  cron.schedule("0 5 * * *", async () => {
    await OrphanedPaymentDetectionJob.run();
  });

  // Run daily at 3 AM
  cron.schedule("0 3 * * *", async () => {
    await IdempotencyKeyCleanupJob.run();
  });

  // 🚀 CACHE JOBS
  cron.schedule("*/10 * * * *", async () => {
    console.log("[CRON] Running prewarmDashboards");
    try {
      await prewarmDashboards();
    } catch (error) {
      console.error("[CRON] prewarmDashboards failed:", error);
    }
  });
    
  cron.schedule("*/5 * * * *", async () => {
    await trackJobExecution("AutoCompleteOrdersJob", async () => {
      await AutoCompleteOrdersJob.run();
    });
  });
    
  console.log("✅ All cron jobs scheduled successfully");
};

export {
  AutoCompleteOrdersJob,
  AutoCancelOrdersJob,
  DetectStuckOrdersJob,
  OrderTimeoutAlertJob,
  DailyStoreMetricsJob,
  HourlyRevenueJob,
  ProductPopularityJob,
  StaleOrderMetricsJob,
  PaymentTimeoutJob,
  PaymentRetryJob,
};


// // 🧾 Billing – first day of month
// cron.schedule("0 0 1 * *", generateMonthlyInvoices);

// // ⏰ Daily invoice enforcement
// cron.schedule("0 1 * * *", markOverdueInvoices);
// cron.schedule("0 2 * * *", suspendOverdueTenants);

// // 📊 Analytics (after billing)
// cron.schedule("0 3 1 * *", monthlyRevenueAnalytics);

// cron.schedule("* * * * *", async () => {
//     await AutoCancelOrdersJob.run();
// });

// cron.schedule("5 0 * * *", async () => {
//     await AnalyticsAggregationJob.run();
// });
