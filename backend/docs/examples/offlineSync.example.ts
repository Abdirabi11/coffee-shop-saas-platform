import { OfflineSyncService } from "../services/staff/OfflineSync.service.ts";

async function offlineSyncWorkflow() {
    const userUuid = "staff-123";
    const storeUuid = "store-456";

    // 1. Device goes online - download sync package
    console.log("📦 Downloading offline package...");
    
    const syncPackage = await OfflineSyncService.prepareOfflinePackage({
        userUuid,
        storeUuid,
    });

    console.log("✅ Package downloaded:");
    console.log("  - User profile:", syncPackage.userProfile?.firstName);
    console.log("  - Permissions:", syncPackage.permissions?.allPermissions.length);
    console.log("  - Today's shifts:", syncPackage.shifts?.length);
    console.log("  - Active staff:", syncPackage.activeStaff?.length);
    console.log("  - Menu items:", syncPackage.menuItems?.length);

    // Store locally for offline use
    localStorage.setItem("offlinePackage", JSON.stringify(syncPackage));

    // 2. Device goes offline - user works offline
    console.log("📴 Device offline - working offline...");

    const offlineActions = [];

    // Clock in offline
    offlineActions.push({
        type: "CLOCK_IN",
        data: {
            latitude: 40.7128,
            longitude: -74.0060,
            shiftUuid: "shift-789",
        },
        timestamp: new Date().toISOString(),
        deviceId: "POS-TERMINAL-01",
    });

    // Take break offline
    offlineActions.push({
        type: "BREAK_START",
        data: {
            timeEntryUuid: "entry-123",
            breakType: "UNPAID",
        },
        timestamp: new Date(Date.now() + 3600000).toISOString(),
        deviceId: "POS-TERMINAL-01",
    });

    // Read announcement offline
    offlineActions.push({
        type: "ANNOUNCEMENT_READ",
        data: {
            announcementUuid: "announcement-456",
        },
        timestamp: new Date(Date.now() + 7200000).toISOString(),
        deviceId: "POS-TERMINAL-01",
    });

    console.log("📝", offlineActions.length, "actions queued");

    // 3. Device back online - sync actions
    console.log("📶 Device back online - syncing...");

    const syncResults = await OfflineSyncService.syncOfflineActions({
        userUuid,
        storeUuid,
        actions: offlineActions,
    });

    console.log("✅ Sync completed:");
    console.log("  - Total:", syncResults.total);
    console.log("  - Synced:", syncResults.synced);
    console.log("  - Conflicts:", syncResults.conflicts);
    console.log("  - Errors:", syncResults.errors);

    // Handle conflicts
    if (syncResults.conflicts > 0) {
        console.warn("⚠️  Conflicts detected - manager review needed");
        syncResults.details
        .filter(d => d.status === "conflict")
        .forEach(conflict => {
            console.warn("  -", conflict.type, "at", conflict.timestamp);
        });
    };
}