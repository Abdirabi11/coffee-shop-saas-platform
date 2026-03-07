import { ApprovalRequestService } from "../services/staff/ApprovalRequest.service.ts";
import { PerformanceTrackingService } from "../services/staff/PerformanceTracking.service.ts";
import { ShiftManagementService } from "../services/staff/ShiftManagement.service.ts";
import { TimeEntryService } from "../services/staff/TimeEntry.service.ts";


async function managerDashboardData(storeUuid: string) {
    const today = new Date();

    // 1. Today's shift coverage
    const coverage = await ShiftManagementService.getShiftCoverage({
        storeUuid,
        date: today,
    });

    console.log("📅 Today's Coverage:");
    console.log("  Morning:", coverage.morning.length, "staff");
    console.log("  Afternoon:", coverage.afternoon.length, "staff");
    console.log("  Evening:", coverage.evening.length, "staff");

    // 2. Currently clocked in
    const activeEntries = await TimeEntryService.getActiveTimeEntries(storeUuid);

    console.log("\n👥 Currently Working:", activeEntries.length);
    activeEntries.forEach(entry => {
        const hours = ((Date.now() - entry.clockInAt.getTime()) / 3600000).toFixed(1);
        console.log(`  - ${entry.user.firstName} ${entry.user.lastName} (${hours}h)`);
    });

    // 3. Pending approvals
    const pendingApprovals = await ApprovalRequestService.getPendingRequests({
        storeUuid,
    });

    console.log("\n⏳ Pending Approvals:", pendingApprovals.length);
    pendingApprovals.forEach(req => {
        console.log(`  - ${req.approvalType} from ${req.requester.firstName}`);
    });

    // 4. Top performers this week
    const leaderboard = await PerformanceTrackingService.getLeaderboard({
        storeUuid,
        periodType: "WEEKLY",
        metric: "totalRevenue",
        limit: 5,
    });

    console.log("\n🏆 Top Performers (Revenue):");
    leaderboard.forEach(entry => {
        const revenue = (entry.value / 100).toFixed(2);
        console.log(`  ${entry.rank}. ${entry.user.firstName} - $${revenue}`);
    });

    return {
        coverage,
        activeStaff: activeEntries.length,
        pendingApprovals: pendingApprovals.length,
        topPerformers: leaderboard,
    };
}