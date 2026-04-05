import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { TimeEntryService } from "./TimeEntry.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

interface OfflineData {
    userProfile?: any;
    permissions?: any;
    shifts?: any[];
    activeStaff?: any[];
    cashDrawer?: any;
    menuItems?: any[];
    announcements?: any[];
    tasks?: any[];
}

export class OfflineSyncService {
    //Prepare offline data package for staff member
    static async prepareOfflinePackage(input: {
        userUuid: string;
        storeUuid: string;
    }): Promise<OfflineData> {
        try {
            const [
                userProfile,
                permissions,
                shifts,
                activeStaff,
                cashDrawer,
                menuItems,
                announcements,
                tasks,
            ] = await Promise.all([
                // User profile
                this.getUserProfile(input.userUuid),
                
                // Permissions for this store
                this.getUserPermissions(input.userUuid, input.storeUuid),
                
                // Today's shifts
                this.getTodayShifts(input.storeUuid),
                
                // Active staff list
                this.getActiveStaff(input.storeUuid),
                
                // Cash drawer if open
                this.getActiveCashDrawer(input.userUuid, input.storeUuid),
                
                // Menu items (simplified)
                this.getMenuItems(input.storeUuid),
                
                // Announcements
                this.getAnnouncements(input.userUuid, input.storeUuid),
                
                // Tasks
                this.getUserTasks(input.userUuid, input.storeUuid),
            ]);

            const packageData = {
                userProfile,
                permissions,
                shifts,
                activeStaff,
                cashDrawer,
                menuItems,
                announcements,
                tasks,
                syncedAt: new Date().toISOString(),
            };

            logWithContext("info", "[OfflineSync] Package prepared", {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                dataSize: JSON.stringify(packageData).length,
            });

            MetricsService.increment("offline_sync.package_created", 1);

            return packageData;

        } catch (error: any) {
            logWithContext("error", "[OfflineSync] Failed to prepare package", {
                error: error.message,
            });
            throw error;
        }
    }

    //Sync offline actions when back online
    static async syncOfflineActions(input: {
        userUuid: string;
        storeUuid: string;
        actions: Array<{
            type: string;
            data: any;
            timestamp: string;
            deviceId: string;
        }>;
    }) {
        const results = {
            total: input.actions.length,
            synced: 0,
            conflicts: 0,
            errors: 0,
            details: [] as any[],
        };

        // Sort actions by timestamp
        const sortedActions = input.actions.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (const action of sortedActions) {
            try {
                const result = await this.syncAction({
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    action,
                });

                if (result.conflict) {
                    results.conflicts++;
                } else {
                    results.synced++;
                }

                results.details.push({
                    type: action.type,
                    timestamp: action.timestamp,
                    status: result.conflict ? "conflict" : "synced",
                    data: result,
                });

            } catch (error: any) {
                results.errors++;
                results.details.push({
                    type: action.type,
                    timestamp: action.timestamp,
                    status: "error",
                    error: error.message,
                });

                logWithContext("error", "[OfflineSync] Action sync failed", {
                    type: action.type,
                    error: error.message,
                });
            }
        }

        logWithContext("info", "[OfflineSync] Sync completed", results);

        MetricsService.increment("offline_sync.completed", 1);
        MetricsService.gauge("offline_sync.conflicts", results.conflicts);

        return results;
    }

    //Sync individual action
    private static async syncAction(input: {
        userUuid: string;
        storeUuid: string;
        action: {
            type: string;
            data: any;
            timestamp: string;
            deviceId: string;
        };
    }) {
        const { type, data, timestamp, deviceId } = input.action;

        switch (type) {
            case "CLOCK_IN":
                return this.syncClockIn({
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    data,
                    timestamp,
                    deviceId,
                });

            case "CLOCK_OUT":
                return this.syncClockOut({
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    data,
                    timestamp,
                    deviceId,
                });

            case "BREAK_START":
                return this.syncBreakStart({
                    userUuid: input.userUuid,
                    data,
                    timestamp,
                });

            case "BREAK_END":
                return this.syncBreakEnd({
                    data,
                    timestamp,
                });

            case "CASH_COUNT":
                return this.syncCashCount({
                    data,
                    timestamp,
                });

            case "ANNOUNCEMENT_READ":
                return this.syncAnnouncementRead({
                    userUuid: input.userUuid,
                    data,
                });

            case "TASK_UPDATE":
                return this.syncTaskUpdate({
                    data,
                    timestamp,
                });

            default:
                throw new Error(`UNKNOWN_ACTION_TYPE: ${type}`);
        }
    }

    private static async syncClockIn(input: {
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
        deviceId: string;
    }) {
        // Check if already clocked in online
        const existing = await prisma.timeEntry.findFirst({
            where: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                clockOutAt: null,
            },
        });

        if (existing) {
            // Conflict: user already clocked in
            const onlineTime = dayjs(existing.clockInAt);
            const offlineTime = dayjs(input.timestamp);

            if (Math.abs(onlineTime.diff(offlineTime, "minute")) > 5) {
                // Significant difference - flag for review
                await TimeEntryService.handleSyncConflict({
                    timeEntryUuid: existing.uuid,
                    reason: `Offline clock-in at ${input.timestamp} conflicts with online clock-in at ${existing.clockInAt}`,
                });

                return { conflict: true, reason: "ALREADY_CLOCKED_IN" };
            };

            // Small difference - accept online version
            return { conflict: false, acceptedOnline: true };
        };

        // No conflict - create clock-in with offline timestamp
        const result = await TimeEntryService.clockIn({
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            deviceId: input.deviceId,
            latitude: input.data.latitude,
            longitude: input.data.longitude,
            shiftUuid: input.data.shiftUuid,
        });

        // Update to offline timestamp if different
        if (dayjs(result.timeEntry.clockInAt).diff(dayjs(input.timestamp), "second") > 10) {
            await prisma.timeEntry.update({
                where: { uuid: result.timeEntry.uuid },
                data: {
                    clockInAt: new Date(input.timestamp),
                },
            });
        }

        return { conflict: false, synced: true };
    }

    private static async syncClockOut(input: {
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
        deviceId: string;
    }) {
        // Find active time entry
        const timeEntry = await prisma.timeEntry.findFirst({
            where: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                clockOutAt: null,
            },
        });

        if (!timeEntry) {
            // Conflict: no active clock-in found
            await prisma.staffApprovalRequest.create({
                data: {
                    tenantUuid: await this.getTenantUuid(input.userUuid, input.storeUuid),
                    storeUuid: input.storeUuid,
                    requestedBy: input.userUuid,
                    approvalType: "MISSED_CLOCK_OUT",
                    requestData: {
                        offlineTimestamp: input.timestamp,
                        latitude: input.data.latitude,
                        longitude: input.data.longitude,
                    },
                    status: "PENDING",
                },
            });

            return { conflict: true, reason: "NO_ACTIVE_CLOCK_IN" };
        };

        // No conflict - perform clock out
        await TimeEntryService.clockOut({
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            deviceId: input.deviceId,
            latitude: input.data.latitude,
            longitude: input.data.longitude,
        });

        return { conflict: false, synced: true };
    }

    private static async syncBreakStart(input: {
        userUuid: string;
        data: any;
        timestamp: string;
    }) {
        const timeEntry = await prisma.timeEntry.findFirst({
            where: {
                userUuid: input.userUuid,
                uuid: input.data.timeEntryUuid,
            },
        });

        if (!timeEntry) {
            return { conflict: true, reason: "TIME_ENTRY_NOT_FOUND" };
        }

        await TimeEntryService.startBreak({
            timeEntryUuid: input.data.timeEntryUuid,
            breakType: input.data.breakType,
        });

        return { conflict: false, synced: true };
    }

    private static async syncBreakEnd(input: {
        data: any;
        timestamp: string;
    }) {
        await TimeEntryService.endBreak({
            breakEntryUuid: input.data.breakEntryUuid,
        });

        return { conflict: false, synced: true };
    }

    private static async syncCashCount(input: {
        data: any;
        timestamp: string;
    }) {
        // Cash counts are usually final, so just record it
        await prisma.cashCount.create({
            data: {
                cashDrawerUuid: input.data.drawerUuid,
                countType: input.data.countType,
                countedBy: input.data.countedBy,
                countedAt: new Date(input.timestamp),
                ...input.data.denominations,
            },
        });

        return { conflict: false, synced: true };
    }

    private static async syncAnnouncementRead(input: {
        userUuid: string;
        data: any;
    }) {
        const announcement = await prisma.shiftAnnouncement.findUnique({
            where: { uuid: input.data.announcementUuid },
        });

        if (announcement && !announcement.readBy.includes(input.userUuid)) {
            await prisma.shiftAnnouncement.update({
                where: { uuid: input.data.announcementUuid },
                data: {
                    readBy: {
                        push: input.userUuid,
                    },
                },
            });
        }

        return { conflict: false, synced: true };
    }

    private static async syncTaskUpdate(input: {
        data: any;
        timestamp: string;
    }) {
        await prisma.staffTask.update({
            where: { uuid: input.data.taskUuid },
            data: {
                status: input.data.status,
                completedAt: input.data.status === "COMPLETED" ? new Date(input.timestamp) : undefined,
                completedBy: input.data.completedBy,
                completionNotes: input.data.completionNotes,
            },
        });

        return { conflict: false, synced: true };
    }

    // Helper methods for preparing offline package
    private static async getUserProfile(userUuid: string) {
        return prisma.user.findUnique({
            where: { uuid: userUuid },
            select: {
                uuid: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                profilePhoto: true,
                employmentStatus: true,
            },
        });
    }

    private static async getUserPermissions(userUuid: string, storeUuid: string) {
        const { PermissionManagementService } = require("./PermissionManagement.service");
        return PermissionManagementService.getUserPermissions({ userUuid, storeUuid });
    }

    private static async getTodayShifts(storeUuid: string) {
        const { ShiftManagementService } = require("./ShiftManagement.service");
        return ShiftManagementService.getStoreShifts({
            storeUuid,
            date: new Date(),
        });
    }

    private static async getActiveStaff(storeUuid: string) {
        const { StaffManagementService } = require("./StaffManagement.service");
        return StaffManagementService.getStoreStaff(storeUuid, false);
    }

    private static async getActiveCashDrawer(userUuid: string, storeUuid: string) {
        const { CashDrawerService } = require("./CashDrawer.service");
        return CashDrawerService.getActiveDrawer({ userUuid, storeUuid });
    }

    private static async getMenuItems(storeUuid: string) {
        return prisma.product.findMany({
            where: {
                storeUuid,
                isActive: true,
            },
            select: {
                uuid: true,
                name: true,
                basePrice: true,
                imageUrls: true,
                categoryUuid: true,
            },
            take: 100, // Limit for offline package
        });
    }

    private static async getAnnouncements(userUuid: string, storeUuid: string) {
        const { StaffCommunicationService } = require("./StaffCommunication.service");
        return StaffCommunicationService.getActiveAnnouncements({ userUuid, storeUuid });
    }

    private static async getUserTasks(userUuid: string, storeUuid: string) {
        const { StaffCommunicationService } = require("./StaffCommunication.service");
        return StaffCommunicationService.getUserTasks({
            userUuid,
            storeUuid,
            status: "PENDING",
        });
    }

    private static async getTenantUuid(userUuid: string, storeUuid: string) {
        const userStore = await prisma.userStore.findUnique({
            where: {
                userUuid_storeUuid: { userUuid, storeUuid },
            },
        });
        return userStore?.tenantUuid || "";
    }
}