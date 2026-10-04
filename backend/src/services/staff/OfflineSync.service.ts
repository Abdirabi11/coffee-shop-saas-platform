import dayjs from "dayjs";
import { CountType, TaskStatus } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { TimeEntryService } from "./TimeEntry.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

const COIN_VALUES_CENTS = { pennies: 1, nickels: 5, dimes: 10, quarters: 25 } as const;
const BILL_VALUES_CENTS = { ones: 100, fives: 500, tens: 1000, twenties: 2000, fifties: 5000, hundreds: 10000 } as const;

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
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
    }): Promise<OfflineData> {
        try {
            await this.assertStoreAccess(input);

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
                this.getMenuItems(input.tenantUuid, input.storeUuid),
                
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
        tenantUuid: string;
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

        // tenantUuid comes from req.tenant and storeUuid must belong to it;
        // reject the whole batch before touching anything.
        await this.assertStoreAccess(input);

        // Sort actions by timestamp
        const sortedActions = [...input.actions].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (const action of sortedActions) {
            try {
                const result = await this.syncAction({
                    tenantUuid: input.tenantUuid,
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
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        action: {
            type: string;
            data: any;
            timestamp: string;
            deviceId: string;
        };
    }) {
        const { type, timestamp, deviceId } = input.action;
        const data = input.action.data ?? {};
        const scope = {
            tenantUuid: input.tenantUuid,
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
        };

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
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    data,
                    timestamp,
                    deviceId,
                });

            case "BREAK_START":
                return this.syncBreakStart({ ...scope, data, timestamp });

            case "BREAK_END":
                return this.syncBreakEnd({ ...scope, data, timestamp });

            case "CASH_COUNT":
                return this.syncCashCount({ ...scope, data, timestamp });

            case "ANNOUNCEMENT_READ":
                return this.syncAnnouncementRead({ ...scope, data });

            case "TASK_UPDATE":
                return this.syncTaskUpdate({ ...scope, data, timestamp });

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
        tenantUuid: string;
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
                    tenantUuid: input.tenantUuid,
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
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
    }) {
        const timeEntry = await prisma.timeEntry.findFirst({
            where: {
                uuid: input.data.timeEntryUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                userUuid: input.userUuid,
            },
            select: { uuid: true },
        });

        if (!timeEntry) {
            return { conflict: true, reason: "TIME_ENTRY_NOT_FOUND" };
        }

        await TimeEntryService.startBreak({
            timeEntryUuid: timeEntry.uuid,
            breakType: input.data.breakType,
        });

        return { conflict: false, synced: true };
    }

    private static async syncBreakEnd(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
    }) {
        // Break must belong to one of this user's time entries at this store
        const breakEntry = await prisma.breakEntry.findFirst({
            where: {
                uuid: input.data.breakEntryUuid,
                timeEntry: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                },
            },
            select: { uuid: true },
        });

        if (!breakEntry) {
            return { conflict: true, reason: "BREAK_NOT_FOUND" };
        }

        await TimeEntryService.endBreak({
            breakEntryUuid: breakEntry.uuid,
        });

        return { conflict: false, synced: true };
    }

    private static async syncCashCount(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
    }) {
        const drawer = await prisma.cashDrawer.findFirst({
            where: {
                uuid: input.data.drawerUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
            },
            select: { uuid: true },
        });

        if (!drawer) {
            return { conflict: true, reason: "DRAWER_NOT_FOUND" };
        }

        const countType = Object.values(CountType).includes(input.data.countType)
            ? (input.data.countType as CountType)
            : undefined;

        // Whitelist denomination fields; never spread client data into the row
        const raw = input.data.denominations ?? {};
        const counts: Record<string, number> = {};
        let totalCoins = 0;
        let totalBills = 0;

        for (const [field, cents] of Object.entries(COIN_VALUES_CENTS)) {
            const n = this.toCount(raw[field]);
            counts[field] = n;
            totalCoins += n * cents;
        }
        for (const [field, cents] of Object.entries(BILL_VALUES_CENTS)) {
            const n = this.toCount(raw[field]);
            counts[field] = n;
            totalBills += n * cents;
        }

        // Cash counts are usually final, so just record it
        await prisma.cashCount.create({
            data: {
                cashDrawerUuid: drawer.uuid,
                countType,
                countedBy: input.userUuid,
                countedAt: new Date(input.timestamp),
                ...counts,
                totalCoins,
                totalBills,
                totalCash: totalCoins + totalBills,
            },
        });

        return { conflict: false, synced: true };
    }

    private static async syncAnnouncementRead(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        data: any;
    }) {
        const announcement = await prisma.shiftAnnouncement.findFirst({
            where: {
                uuid: input.data.announcementUuid,
                tenantUuid: input.tenantUuid,
                OR: [{ storeUuid: input.storeUuid }, { storeUuid: null }],
            },
            select: { uuid: true, readBy: true },
        });

        if (announcement && !announcement.readBy.includes(input.userUuid)) {
            await prisma.shiftAnnouncement.update({
                where: { uuid: announcement.uuid },
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
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
        data: any;
        timestamp: string;
    }) {
        // Staff can only update tasks assigned to them at this store
        const task = await prisma.staffTask.findFirst({
            where: {
                uuid: input.data.taskUuid,
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                assignedTo: input.userUuid,
            },
            select: { uuid: true },
        });

        if (!task) {
            return { conflict: true, reason: "TASK_NOT_FOUND" };
        }

        if (!Object.values(TaskStatus).includes(input.data.status)) {
            throw new Error(`INVALID_TASK_STATUS: ${input.data.status}`);
        }
        const status = input.data.status as TaskStatus;
        const isCompleted = status === TaskStatus.COMPLETED;

        await prisma.staffTask.update({
            where: { uuid: task.uuid },
            data: {
                status,
                completedAt: isCompleted ? new Date(input.timestamp) : undefined,
                completedBy: isCompleted ? input.userUuid : undefined,
                completionNotes: typeof input.data.completionNotes === "string"
                    ? input.data.completionNotes
                    : undefined,
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
        const { PermissionManagementService } = await import("./PermissionManagement.service.ts");
        return PermissionManagementService.getUserPermissions({ userUuid, storeUuid });
    }

    private static async getTodayShifts(storeUuid: string) {
        const { ShiftManagementService } = await import("./ShiftManagement.service.ts");
        return ShiftManagementService.getStoreShifts({
            storeUuid,
            date: new Date(),
        });
    }

    private static async getActiveStaff(storeUuid: string) {
        const { StaffManagementService } = await import("./StaffManagement.service.ts");
        return StaffManagementService.getStoreStaff(storeUuid, false);
    }

    private static async getActiveCashDrawer(userUuid: string, storeUuid: string) {
        const { CashDrawerService } = await import("./CashDrawer.service.ts");
        return CashDrawerService.getActiveDrawer({ userUuid, storeUuid });
    }

    private static async getMenuItems(tenantUuid: string, storeUuid: string) {
        return prisma.product.findMany({
            where: {
                tenantUuid,
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
        const { StaffCommunicationService } = await import("./StaffCommunication.service.ts");
        return StaffCommunicationService.getActiveAnnouncements({ userUuid, storeUuid });
    }

    private static async getUserTasks(userUuid: string, storeUuid: string) {
        const { StaffCommunicationService } = await import("./StaffCommunication.service.ts");
        return StaffCommunicationService.getUserTasks({
            userUuid,
            storeUuid,
            status: "PENDING",
        });
    }

    // The store must belong to the authenticated tenant, and the user must
    // have an active assignment there.
    private static async assertStoreAccess(input: {
        tenantUuid: string;
        userUuid: string;
        storeUuid: string;
    }) {
        const membership = await prisma.userStore.findFirst({
            where: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                tenantUuid: input.tenantUuid,
                isActive: true,
            },
            select: { uuid: true },
        });

        if (!membership) {
            throw new Error("STORE_ACCESS_DENIED");
        }
    }

    private static toCount(value: unknown): number {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 ? n : 0;
    }
}