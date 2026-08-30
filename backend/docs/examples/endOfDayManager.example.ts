import dayjs from "dayjs";
import { OrderAttributionService } from "../services/staff/OrderAttribution.service.ts";
import { BreakEnforcementService } from "../services/staff/BreakEnforcement.service.ts";
import { LaborCostTrackingService } from "../services/staff/LaborCostTracking.service.ts";
import { TipsAndCommissionService } from "../services/staff/TipsAndCommission.service.ts";

async function endOfDayManagerWorkflow() {
    const storeUuid = "store-456";

    console.log("🏪 End-of-Day Manager Workflow\n");

    // 1. Calculate tip pool
    console.log("💰 Calculating tip pool...");
    const today = dayjs();
    const tipPool = await TipsAndCommissionService.calculateTipPool({
        storeUuid,
        periodStart: today.startOf("day").toDate(),
        periodEnd: today.endOf("day").toDate(),
        periodType: "DAILY",
    });

    console.log("✅ Tip pool calculated:");
    console.log(`  - Total tips: $${(tipPool.totalTips / 100).toFixed(2)}`);
    console.log(`  - Total orders: ${tipPool.totalOrders}`);
    console.log(`  - Staff hours: ${tipPool.totalHoursWorked.toFixed(2)}`);

    // 2. Check labor costs
    console.log("\n📊 Labor Cost Analysis...");
    const dashboard = await LaborCostTrackingService.getLaborDashboard({
        storeUuid,
    });

    console.log("✅ Labor metrics:");
    console.log(`  - Today labor %: ${dashboard.today.laborCostPercent.toFixed(2)}%`);
    console.log(`  - Week-to-date labor %: ${dashboard.weekToDate.laborCostPercent.toFixed(2)}%`);
    console.log(`  - Sales per labor hour: $${(dashboard.today.salesPerLaborHour / 100).toFixed(2)}`);
    
    if (dashboard.today.isOverBudget) {
        console.log("⚠️  WARNING: Labor cost is over budget!");
        console.log(`  - Over by: ${dashboard.today.budgetVariance.toFixed(2)}%`);
    }

    console.log(`  - Currently clocked in: ${dashboard.activeStaff.length} staff`);

    // 3. Check break violations
    console.log("\n☕ Break Compliance...");
    const violations = await BreakEnforcementService.getViolations({
        storeUuid,
        acknowledged: false,
        dateFrom: today.startOf("day").toDate(),
        dateTo: today.endOf("day").toDate(),
    });

    console.log(`✅ Break violations: ${violations.length}`);
  
    if (violations.length > 0) {
        console.log("⚠️  Unacknowledged violations:");
        violations.forEach(v => {
            console.log(`  - ${v.user.firstName} ${v.user.lastName}: ${v.violationType}`);
        });
    }

    // 4. Top performers
    console.log("\n🏆 Top Performers Today...");
    const performers = await OrderAttributionService.getTopPerformers({
        storeUuid,
        dateFrom: today.startOf("day").toDate(),
        dateTo: today.endOf("day").toDate(),
        limit: 3,
    });

    performers.forEach(p => {
        console.log(`  ${p.rank}. ${p.user.firstName} ${p.user.lastName}:`);
        console.log(`     - ${p.orderCount} orders`);
        console.log(`     - $${(p.totalRevenue / 100).toFixed(2)} revenue`);
        console.log(`     - $${(p.avgOrderValue / 100).toFixed(2)} avg order`);
    });
}