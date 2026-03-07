import { CashDrawerService } from "../services/staff/CashDrawer.service.ts";
import { TimeEntryService } from "../services/staff/TimeEntry.service.ts";


async function completeShiftWorkflow() {
    const userUuid = "staff-123";
    const storeUuid = "store-456";
    const deviceId = "POS-TERMINAL-01";

    // 1. Staff arrives and clocks in
    console.log("📍 Staff arriving at store...");
    
    const clockInResult = await TimeEntryService.clockIn({
        userUuid,
        storeUuid,
        deviceId,
        latitude: 40.7128, // GPS coordinates
        longitude: -74.0060,
        shiftUuid: "shift-789", // If they have a scheduled shift
    });

    if (clockInResult.geofenceViolation) {
        console.warn("⚠️  Geofence violation - distance:", clockInResult.distanceFromStore);
    };

    if (clockInResult.requiresApproval) {
        console.warn("⚠️  Requires manager approval:", clockInResult.approvalReason);
    };

    console.log("✅ Clocked in:", clockInResult.timeEntry.uuid);

    // 2. Open cash drawer
    const drawer = await CashDrawerService.openDrawer({
        tenantUuid: "tenant-123",
        storeUuid,
        userUuid,
        startingCash: 20000, // $200 starting cash
        drawerNumber: "DRAWER-1",
        openedBy: userUuid,
    });

    console.log("✅ Cash drawer opened:", drawer.uuid);

    // 3. Work for a few hours...
    console.log("☕ Working shift...");

    // 4. Take a break
    const timeEntry = clockInResult.timeEntry;
    
    const breakEntry = await TimeEntryService.startBreak({
        timeEntryUuid: timeEntry.uuid,
        breakType: "UNPAID",
    });

    console.log("☕ Break started");

    // Simulate 30 minute break
    await new Promise(resolve => setTimeout(resolve, 1000)); // In reality: 30 min

    await TimeEntryService.endBreak({
        breakEntryUuid: breakEntry.uuid,
    });

    console.log("✅ Break ended");

    // 5. Mid-shift cash drop (excess cash to safe)
    const cashDrop = await CashDrawerService.createCashDrop({
        drawerUuid: drawer.uuid,
        storeUuid,
        amount: 50000, // $500 to safe
        droppedBy: userUuid,
        reason: "Excess cash removal",
    });

    console.log("💰 Cash drop created:", cashDrop.receiptNumber);

    // 6. End of shift - close drawer
    const closeResult = await CashDrawerService.closeDrawer({
        drawerUuid: drawer.uuid,
        actualCash: 32500, // Counted cash
        closedBy: userUuid,
        cashCount: {
            twenties: 100, // 100x $20 = $2000
            tens: 50,      // 50x $10 = $500
            fives: 20,     // 20x $5 = $100
            ones: 25,      // 25x $1 = $25
            quarters: 100, // 100x $0.25 = $25
        },
        notes: "Busy day",
    });

    if (closeResult.requiresApproval) {
        console.warn("⚠️  Cash variance requires approval:", closeResult.variance);
    };

    console.log("✅ Drawer closed - variance:", closeResult.variance / 100);

    // 7. Clock out
    await TimeEntryService.clockOut({
        userUuid,
        storeUuid,
        deviceId,
        latitude: 40.7128,
        longitude: -74.0060,
    });

    console.log("✅ Clocked out - shift complete");
}