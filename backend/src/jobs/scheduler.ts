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
import { DailyReconciliationJob } from "./Payment/DailyReconciliation.job.ts";
import { AnomalyReviewJob } from "./Payment/AnomalyReview.job.ts";
import { CashDrawerReminderJob } from "./Payment/CashDrawerReminder.job.ts";
import { PaymentPollingReconciliationJob } from "./Payment/PaymentPollingReconciliation.ts";
import { ProviderReportReconciliation } from "./Payment/ProviderReportReconciliation.ts";
import { RiskScoreDecayJob } from "./Payment/RiskScoreDecay.jobs.ts";
import { WebhookRetryJob } from "./webhook/webhookRetry.job.ts";
import { PaymentExpiryCleanupJob } from "./Payment/PaymentExpiryCleanup.job.js";
import { OrphanedPaymentDetectionJob } from "./Payment/OrphanedPaymentDetection.job.js";
import { IdempotencyKeyCleanupJob } from "./Payment/IdempotencyKeyCleanup.job.js";
import { MenuCacheWarmupJob } from "./Product/menuCacheWarmup.job.ts";
import { LowStockAlertJob } from "./Product/lowStockAlert.job.ts";
import { ProductMetricsCalculationJob } from "./Product/productMetricsCalculation.job.ts";
import { OrderExpiryCleanupJobs } from "./Order/orderExpiryCleanup.jobs.ts";
import { OrderMetricsCalculationJob } from "./Order/orderMetricsCalculation.job.ts";
import { DeviceCleanupJob } from "./auth/DeviceCleanup.job.ts";
import { FraudEventCleanupJob } from "./auth/FraudEventCleanup.job.ts";
import { OTPCleanupJob } from "./auth/OTPCleanup.job.ts";
import { SessionCleanupJob } from "./auth/SessionCleanup.job.ts";
import { QuotaResetJob } from "./Billing/QuotaReset.job.ts";
import { SubscriptionRenewalJob } from "./Billing/SubscriptionRenewal.job.ts";
import { WebhookMonitoringJob } from "./webhook/WebhookMonitoring.job.ts";
import { WebhookCleanupJob } from "./webhook/WebhookCleanup.job.ts";
import { MissedShiftTrackerJob } from "./staff/MissedShiftTracker.job.ts";
import { AutoClockOutJob } from "./staff/AutoClockOut.job.ts";
import { ShiftReminderJob } from "./staff/ShiftReminder.job.ts";
import { PerformanceCalculationJob } from "./staff/PerformanceCalculation.job.ts";
import { BreakEnforcementMonitorJob } from "./staff/BreakEnforcementMonitor.job.ts";
import { LaborCostSnapshotJob } from "./staff/LaborCostSnapshot.job.ts";
import { CommissionCalculationJob } from "./staff/CommissionCalculation.job.ts";
import { TipPoolCalculationJob } from "./staff/TipPoolCalculation.job.ts";
import { MenuAnalyticsAggregationJob } from "./menu/MenuAnalyticsAggregation.job.ts";
import { SnapshotCleanupJob } from "./menu/SnapshotCleanup.job.ts";
import { MenuSnapshotJob } from "./menu/MenuSnapshot.job.ts";
import { MenuCacheWarmingJob } from "./menu/MenuCacheWarming.job.ts";
import { RefundProcessorJob } from "./Payment/refundProcessor.job.js";
import { ProviderReportReconciliationJob } from "./Payment/ProviderReportReconciliation.job.ts";
import { DashboardSnapshotJob } from "./dashboard/dashboardSnapshot.job.ts";
import { DashboardCacheWarmingJob } from "./dashboard/dashboardCacheWarming.Job.ts";
import { DashboardSnapshotCleanupJob } from "./dashboard/dashboardSnapshotCleanup.job.ts";
import { AnalyticsAggregationJob } from "./Analytics/AnalyticsAggregation.job.ts";
import { AnalyticsSnapshotCleanupJob } from "./Analytics/Analyticssnapshotcleanup.job.ts";
import { ReservationExpiryJob } from "./Inventory/ReservationExpiry.job.js";
import { LowStockCheckJob } from "./Inventory/LowStockCheck.job.js";
import { InventoryReconciliationJob } from "./Inventory/InventoryReconciliation.job.js";



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

// AUTH & SECURITY JOBS

// Every hour - Clean up expired sessions
cron.schedule("0 * * * *", async () => {
  console.log("[CRON] Running SessionCleanupJob");
  try {
    await SessionCleanupJob.run();
  } catch (error) {
    console.error("[CRON] SessionCleanupJob failed:", error);
  }
});

// Every 30 minutes - Clean up expired OTPs
cron.schedule("*/30 * * * *", async () => {
  console.log("[CRON] Running OTPCleanupJob");
  try {
    await OTPCleanupJob.run();
  } catch (error) {
    console.error("[CRON] OTPCleanupJob failed:", error);
  }
});

// Daily at 3:00 AM - Clean up old devices
cron.schedule("0 3 * * *", async () => {
  console.log("[CRON] Running DeviceCleanupJob");
  try {
    await DeviceCleanupJob.run();
  } catch (error) {
    console.error("[CRON] DeviceCleanupJob failed:", error);
  }
});

// Daily at 4:00 AM - Archive old fraud events
cron.schedule("0 4 * * *", async () => {
  console.log("[CRON] Running FraudEventCleanupJob");
  try {
    await FraudEventCleanupJob.run();
  } catch (error) {
    console.error("[CRON] FraudEventCleanupJob failed:", error);
  }
});

//Staff Cron

/**
 * Daily Performance Calculation
 * Every day at 2:00 AM
 */
cron.schedule("0 2 * * *", async () => {
  console.log("[CRON] Running PerformanceCalculationJob");
  try {
    await PerformanceCalculationJob.run();
  } catch (error: any) {
    console.error("[CRON] PerformanceCalculationJob failed:", error.message);
  }
});

/**
 * Shift Reminders
 * Every 5 minutes
 */
cron.schedule("*/5 * * * *", async () => {
  console.log("[CRON] Running ShiftReminderJob");
  try {
    await ShiftReminderJob.run();
  } catch (error: any) {
    console.error("[CRON] ShiftReminderJob failed:", error.message);
  }
});

/**
 * Auto Clock-Out
 * Every hour
 */
cron.schedule("0 * * * *", async () => {
  console.log("[CRON] Running AutoClockOutJob");
  try {
    await AutoClockOutJob.run();
  } catch (error: any) {
    console.error("[CRON] AutoClockOutJob failed:", error.message);
  }
});

/**
 * Missed Shift Tracker
 * Every 15 minutes
 */
cron.schedule("*/15 * * * *", async () => {
  console.log("[CRON] Running MissedShiftTrackerJob");
  try {
    await MissedShiftTrackerJob.run();
  } catch (error: any) {
    console.error("[CRON] MissedShiftTrackerJob failed:", error.message);
  }
});

/**
 * Daily Tip Pool Calculation
 * Every day at 1:00 AM
 */
cron.schedule("0 1 * * *", async () => {
  console.log("[CRON] Running TipPoolCalculationJob");
  try {
    await TipPoolCalculationJob.run();
  } catch (error: any) {
    console.error("[CRON] TipPoolCalculationJob failed:", error.message);
  }
});

/**
 * Monthly Commission Calculation
 * 1st day of month at 3:00 AM
 */
cron.schedule("0 3 1 * *", async () => {
  console.log("[CRON] Running CommissionCalculationJob");
  try {
    await CommissionCalculationJob.run();
  } catch (error: any) {
    console.error("[CRON] CommissionCalculationJob failed:", error.message);
  }
});

/**
 * Hourly Labor Cost Snapshot
 * Every hour at minute 0
 */
cron.schedule("0 * * * *", async () => {
  console.log("[CRON] Running LaborCostSnapshotJob");
  try {
    await LaborCostSnapshotJob.run();
  } catch (error: any) {
    console.error("[CRON] LaborCostSnapshotJob failed:", error.message);
  }
});

/**
 * Break Enforcement Monitor
 * Every 10 minutes
 */
cron.schedule("*/10 * * * *", async () => {
  console.log("[CRON] Running BreakEnforcementMonitorJob");
  try {
    await BreakEnforcementMonitorJob.run();
  } catch (error: any) {
    console.error("[CRON] BreakEnforcementMonitorJob failed:", error.message);
  }
});

// Dashboard JOBS

cron.schedule(DashboardSnapshotJob.cronSchedule, () => {
  DashboardSnapshotJob.execute();
});
 
// Job 19: Cache warming for active tenants — every 5 minutes
cron.schedule(DashboardCacheWarmingJob.cronSchedule, () => {
  DashboardCacheWarmingJob.execute();
});
 
// Job 20: Snapshot cleanup — 1st of month at 02:00
cron.schedule(DashboardSnapshotCleanupJob.cronSchedule, () => {
  DashboardSnapshotCleanupJob.execute();
});

cron.schedule(DashboardSnapshotJob.cronSchedule, () => {
    DashboardSnapshotJob.execute();
  });
 
  // Job: Cache warming for active tenants + super admin — every 5 minutes
  cron.schedule(DashboardCacheWarmingJob.cronSchedule, () => {
    DashboardCacheWarmingJob.execute();
  });
 
  // Job: Dashboard snapshot cleanup — 1st of month at 02:00
  cron.schedule(DashboardSnapshotCleanupJob.cronSchedule, () => {
    DashboardSnapshotCleanupJob.execute();
  });
 
  // ── Analytics jobs ──────────────────────────────────────────────────────
 
  // Job: Monthly revenue analytics — 1st of month at 00:30
  cron.schedule("30 0 1 * *", () => {
    MonthlyRevenueJob.run();
  });
 
  // Job: Churn analytics — 2nd of month at 00:00 (needs previous month data)
  cron.schedule("0 0 2 * *", () => {
    ChurnAnalyticsJob.run();
  });
 
  // Job: ARPU & LTV — 2nd of month at 01:00
  cron.schedule("0 1 2 * *", () => {
    ArpuLtvJob.run();
  });
 
  // Job: Billing snapshots — 1st of month at 01:00
  cron.schedule("0 1 1 * *", () => {
    GenerateBillingSnapshotsJob.run();
  });
 
  // Job: Cohort retention — 1st of month at 04:00
  cron.schedule(CohortRetentionJob.cronSchedule, () => {
    CohortRetentionJob.run();
  });
 
  // Job: Tenant cohort growth — 1st of month at 04:30
  cron.schedule(TenantCohortGrowthJob.cronSchedule, () => {
    TenantCohortGrowthJob.run();
  });
 
  // Job: Daily analytics aggregation — every day at 01:00
  cron.schedule(AnalyticsAggregationJob.cronSchedule, () => {
    AnalyticsAggregationJob.run();
  });
 
  // Job: Analytics snapshot cleanup — 1st of month at 03:00 (NEW)
  cron.schedule(AnalyticsSnapshotCleanupJob.cronSchedule, () => {
    AnalyticsSnapshotCleanupJob.execute();
  });

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

  //RegisterInventoryJobs

  cron.schedule(ReservationExpiryJob.cronSchedule, () => {
    ReservationExpiryJob.run();
  });
 
  cron.schedule(LowStockCheckJob.cronSchedule, () => {
    LowStockCheckJob.run();
  });
 
  cron.schedule(InventoryReconciliationJob.cronSchedule, () => {
    InventoryReconciliationJob.run();
  });

  //Subscription & plan Jobs

  cron.schedule("0 1 * * *", async () => {
    console.log("[CRON] Running SubscriptionRenewalJob");
    try {
      await SubscriptionRenewalJob.run();
    } catch (error) {
      console.error("[CRON] SubscriptionRenewalJob failed:", error);
    }
  });

  // Daily at 12:00 AM - Reset daily quotas
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Resetting daily quotas");
    try {
      await QuotaResetJob.runDaily();
    } catch (error) {
      console.error("[CRON] Daily quota reset failed:", error);
    }
  });

  // Monthly on 1st at 12:00 AM - Reset monthly quotas
  cron.schedule("0 0 1 * *", async () => {
    console.log("[CRON] Resetting monthly quotas");
    try {
      await QuotaResetJob.runMonthly();
    } catch (error) {
      console.error("[CRON] Monthly quota reset failed:", error);
    }
  });

  // Yearly on Jan 1st at 12:00 AM - Reset yearly quotas
  cron.schedule("0 0 1 1 *", async () => {
    console.log("[CRON] Resetting yearly quotas");
    try {
      await QuotaResetJob.runYearly();
    } catch (error) {
      console.error("[CRON] Yearly quota reset failed:", error);
    }
  });

  // 💳 PAYMENT JOBS    
  cron.schedule(SettlementSyncJob.cronSchedule, () => {
    SettlementSyncJob.run();
  });
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


  //Menu jobs

  cron.schedule("*/15 * * * *", async () => {
    console.log("[CRON] Running MenuCacheWarmingJob");
    try {
      await MenuCacheWarmingJob.run();
    } catch (error: any) {
      console.error("[CRON] MenuCacheWarmingJob failed:", error.message);
    }
  });

  /**
   * Daily Menu Snapshots
   * Daily at 2 AM
   */
  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running MenuSnapshotJob");
    try {
      await MenuSnapshotJob.run();
    } catch (error: any) {
      console.error("[CRON] MenuSnapshotJob failed:", error.message);
    }
  });

  /**
   * Analytics Aggregation
   * Daily at 3 AM
   */
  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running MenuAnalyticsAggregationJob");
    try {
      await MenuAnalyticsAggregationJob.run();
    } catch (error: any) {
      console.error("[CRON] MenuAnalyticsAggregationJob failed:", error.message);
    }
  });

  /**
   * Snapshot Cleanup
   * Weekly on Sunday at 4 AM
   */
  cron.schedule("0 4 * * 0", async () => {
    console.log("[CRON] Running SnapshotCleanupJob");
    try {
      await SnapshotCleanupJob.run();
    } catch (error: any) {
      console.error("[CRON] SnapshotCleanupJob failed:", error.message);
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
cron.schedule("*/30 * * * * *", async () => {
  console.log("[CRON] Running WebhookOutboxProcessor");
  try {
    await WebhookOutboxProcessorJob.run(100);
  } catch (error: any) {
    console.error("[CRON] WebhookOutboxProcessor failed:", error.message);
  }
});

/**
 * Webhook Retry Job
 * Every 5 minutes - Retry failed deliveries
 */
cron.schedule("*/5 * * * *", async () => {
  console.log("[CRON] Running WebhookRetryJob");
  try {
    await WebhookRetryJob.run();
  } catch (error: any) {
    console.error("[CRON] WebhookRetryJob failed:", error.message);
  }
});

/**
 * Webhook Monitoring
 * Every 10 minutes - Monitor webhook health
 */
  cron.schedule("*/10 * * * *", async () => {
    console.log("[CRON] Running WebhookMonitoringJob");
    try {
      await WebhookMonitoringJob.run();
    } catch (error: any) {
      console.error("[CRON] WebhookMonitoringJob failed:", error.message);
    }
  });

  /**
   * Webhook Cleanup
   * Daily at 3:00 AM - Clean up old records
   */
  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Running WebhookCleanupJob");
    try {
      await WebhookCleanupJob.run();
    } catch (error: any) {
      console.error("[CRON] WebhookCleanupJob failed:", error.message);
    }
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

export function registerPaymentJobs() {
  // ── High frequency (real-time operations) ─────────────────────────────

  // Every 2 min: Poll providers for stuck payments
  cron.schedule(PaymentPollingReconciliationJob.cronSchedule, () => {
    PaymentPollingReconciliationJob.run();
  });

  // Every 5 min: Cancel expired payment intents
  cron.schedule(PaymentExpiryCleanupJob.cronSchedule, () => {
    PaymentExpiryCleanupJob.run();
  });
 
  // Every 10 min: Process pending refunds
  cron.schedule(RefundProcessorJob.cronSchedule, () => {
    RefundProcessorJob.run();
  });
 
  // Every 30 min: Retry failed payments
  cron.schedule(PaymentRetryJob.cronSchedule, () => {
    PaymentRetryJob.run();
  });
 
  // ── Medium frequency (monitoring) ─────────────────────────────────────
 
  // Every hour: Check for unreviewed anomalies
  cron.schedule(AnomalyReviewJob.cronSchedule, () => {
    AnomalyReviewJob.run();
  });
 
  // Every hour (offset 30 min): Remind about open drawers
  cron.schedule(CashDrawerReminderJob.cronSchedule, () => {
    CashDrawerReminderJob.run();
  });
 
  // ── Daily ─────────────────────────────────────────────────────────────
 
  // 01:00: Cashier daily reconciliation
  cron.schedule(DailyReconciliationJob.cronSchedule, () => {
    DailyReconciliationJob.run();
  });
 
  // 02:00: Provider report reconciliation (Stripe, EVC)
  cron.schedule(ProviderReportReconciliationJob.cronSchedule, () => {
    ProviderReportReconciliationJob.run();
  });
 
  // 03:00: Decay risk scores
  cron.schedule(RiskScoreDecayJob.cronSchedule, () => {
    RiskScoreDecayJob.run();
  });
 
  // 04:00: Detect orphaned/stuck payments
  cron.schedule(OrphanedPaymentDetectionJob.cronSchedule, () => {
    OrphanedPaymentDetectionJob.run();
  });
 
  // ── Weekly ────────────────────────────────────────────────────────────
 
  // Sunday 03:00: Clean expired idempotency keys
  cron.schedule(IdempotencyKeyCleanupJob.cronSchedule, () => {
    IdempotencyKeyCleanupJob.run();
  });
 
  console.log("✅ Payment jobs registered (10 cron + 1 event-driven)");
}

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
