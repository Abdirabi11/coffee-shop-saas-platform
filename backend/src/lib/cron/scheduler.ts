import cron from "node-cron";
import { monthlyRevenueAnalytics } from "../../jobs/analytics.jobs.ts";
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
};