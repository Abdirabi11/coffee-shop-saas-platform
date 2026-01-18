import cron from "node-cron";
import { AnalyticsAggregationJob } from "../../jobs/analytics-aggregation.job.ts";
import { monthlyRevenueAnalytics } from "../../jobs/analytics.jobs.ts";
import { AutoCancelOrdersJob } from "../../jobs/autoCancel-orders.job.ts";
import { generateMonthlyInvoices, markOverdueInvoices } from "../../jobs/invoice.jobs.ts";
import { suspendOverdueTenants } from "../../jobs/subscription.jobs.ts";


// server bootstrap:

// import { startScheduler } from "./scheduler";

// startScheduler();

export function startScheduler() {
    console.log("🕒 Scheduler started");

    // 🧾 Billing – first day of month
    cron.schedule("0 0 1 * *", generateMonthlyInvoices);

    // ⏰ Daily invoice enforcement
    cron.schedule("0 1 * * *", markOverdueInvoices);
    cron.schedule("0 2 * * *", suspendOverdueTenants);

    // 📊 Analytics (after billing)
    cron.schedule("0 3 1 * *", monthlyRevenueAnalytics);

    cron.schedule("* * * * *", async () => {
        await AutoCancelOrdersJob.run();
    });

    cron.schedule("5 0 * * *", async () => {
        await AnalyticsAggregationJob.run();
    });
};