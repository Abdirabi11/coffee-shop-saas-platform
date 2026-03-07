import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EventBus } from "../../events/eventBus.ts";

export class TimeEntryService {
  
    //Clock in (offline-capable)
    static async clockIn(input: {
        userUuid: string;
        storeUuid: string;
        deviceId: string;
        latitude?: number;
        longitude?: number;
        shiftUuid?: string; // If clocking in for scheduled shift
    }) {
        try {
            // 1. Verify user has access to store
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            if (!userStore || !userStore.isActive) {
                throw new Error("STAFF_NO_STORE_ACCESS");
            }

            // 2. Check if already clocked in
            const existingEntry = await prisma.timeEntry.findFirst({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    clockOutAt: null,
                },
            });

            if (existingEntry) {
                throw new Error("ALREADY_CLOCKED_IN");
            }

            // 3. Geofencing check (if coordinates provided)
            let distanceFromStore: number | undefined;
            let geofenceViolation = false;

            if (input.latitude && input.longitude) {
                const store = await prisma.store.findUnique({
                    where: { uuid: input.storeUuid },
                    select: { latitude: true, longitude: true },
                });

                if (store?.latitude && store?.longitude) {
                    distanceFromStore = this.calculateDistance(
                        input.latitude,
                        input.longitude,
                        store.latitude,
                        store.longitude
                    );

                    // Check if within 100 meters (configurable)
                    const maxDistance = 100; // meters
                    geofenceViolation = distanceFromStore > maxDistance;

                    logWithContext("info", "[TimeEntry] Geofence check", {
                        userUuid: input.userUuid,
                        distance: distanceFromStore,
                        violation: geofenceViolation,
                    });
                }
            }

            // 4. Check if late (if scheduled shift exists)
            let requiresApproval = false;
            let approvalReason: string | undefined;
            let shift;

            if (input.shiftUuid) {
                shift = await prisma.shift.findUnique({
                    where: { uuid: input.shiftUuid },
                });

                if (shift) {
                    const scheduledStart = dayjs(shift.scheduledStart);
                    const actualStart = dayjs();
                    const minutesLate = actualStart.diff(scheduledStart, "minute");

                    if (minutesLate > 5) {
                        // Late by more than 5 minutes
                        requiresApproval = true;
                        approvalReason = `Clocked in ${minutesLate} minutes late`;
                    }
                }
            }

            // 5. Get pay rate
            const tenantUser = await prisma.tenantUser.findUnique({
                where: {
                    tenantUuid_userUuid: {
                        tenantUuid: userStore.tenantUuid,
                        userUuid: input.userUuid,
                    },
                },
            });

            // 6. Create time entry
            const timeEntry = await prisma.timeEntry.create({
                data: {
                    tenantUuid: userStore.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                    shiftUuid: input.shiftUuid,
                    clockInAt: new Date(),
                    clockInDevice: input.deviceId,
                    clockInLat: input.latitude,
                    clockInLng: input.longitude,
                    clockInDistanceM: distanceFromStore,
                    payRate: tenantUser?.payRate,
                    requiresApproval: requiresApproval || geofenceViolation,
                    approvalReason: approvalReason || (geofenceViolation ? "Geofence violation" : undefined),
                },
            });

            // 7. Update shift status
            if (shift) {
                await prisma.shift.update({
                    where: { uuid: shift.uuid },
                    data: {
                        status: "IN_PROGRESS",
                        actualStart: new Date(),
                    },
                });
            };

            logWithContext("info", "[TimeEntry] Clock in successful", {
                timeEntryUuid: timeEntry.uuid,
                userUuid: input.userUuid,
                requiresApproval,
                geofenceViolation,
            });

            MetricsService.increment("time_entry.clock_in", 1, {
                storeUuid: input.storeUuid,
            });

            if (geofenceViolation) {
                MetricsService.increment("time_entry.geofence_violation", 1);
            };

            // Emit event
            EventBus.emit("STAFF_CLOCKED_IN", {
                timeEntryUuid: timeEntry.uuid,
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                requiresApproval,
            });

            return {
                timeEntry,
                requiresApproval,
                approvalReason,
                geofenceViolation,
                distanceFromStore,
            };

        } catch (error: any) {
            logWithContext("error", "[TimeEntry] Clock in failed", {
                error: error.message,
                userUuid: input.userUuid,
            });

            MetricsService.increment("time_entry.clock_in.error", 1);

            throw error;
        }
    }

    //Clock out (offline-capable)
    static async clockOut(input: {
        userUuid: string;
        storeUuid: string;
        deviceId: string;
        latitude?: number;
        longitude?: number;
    }) {
        try {
            // Find active time entry
            const timeEntry = await prisma.timeEntry.findFirst({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    clockOutAt: null,
                },
                include: {
                    shift: true,
                },
            });

            if (!timeEntry) {
                throw new Error("NOT_CLOCKED_IN");
            }

            // Calculate distance from store (if coordinates provided)
            let distanceFromStore: number | undefined;

            if (input.latitude && input.longitude) {
                const store = await prisma.store.findUnique({
                    where: { uuid: input.storeUuid },
                    select: { latitude: true, longitude: true },
                });

                if (store?.latitude && store?.longitude) {
                    distanceFromStore = this.calculateDistance(
                        input.latitude,
                        input.longitude,
                        store.latitude,
                        store.longitude
                    );
                }
            }

            // Calculate hours worked
            const clockInTime = dayjs(timeEntry.clockInAt);
            const clockOutTime = dayjs();
            const hoursWorked = clockOutTime.diff(clockInTime, "hour", true);

            // Calculate total break time
            const breaks = await prisma.breakEntry.findMany({
                where: { timeEntryUuid: timeEntry.uuid },
            });

            const totalBreakMinutes = breaks.reduce((sum, b) => {
                if (!b.breakEnd) return sum;
                return sum + dayjs(b.breakEnd).diff(dayjs(b.breakStart), "minute");
            }, 0);

            // Calculate pay
            const payRate = timeEntry.payRate || 0;
            const totalPay = Math.round(hoursWorked * payRate);

            // Update time entry
            const updated = await prisma.timeEntry.update({
                where: { uuid: timeEntry.uuid },
                data: {
                    clockOutAt: new Date(),
                    clockOutDevice: input.deviceId,
                    clockOutLat: input.latitude,
                    clockOutLng: input.longitude,
                    clockOutDistanceM: distanceFromStore,
                    hoursWorked: Number(hoursWorked.toFixed(2)),
                    breakMinutes: totalBreakMinutes,
                    totalPay,
                },
            });

            // Update shift status
            if (timeEntry.shift) {
                await prisma.shift.update({
                    where: { uuid: timeEntry.shift.uuid },
                    data: {
                        status: "COMPLETED",
                        actualEnd: new Date(),
                    },
                });
            }

            logWithContext("info", "[TimeEntry] Clock out successful", {
                timeEntryUuid: timeEntry.uuid,
                userUuid: input.userUuid,
                hoursWorked: hoursWorked.toFixed(2),
            });

            MetricsService.increment("time_entry.clock_out", 1, {
                storeUuid: input.storeUuid,
            });

            MetricsService.histogram("time_entry.hours_worked", hoursWorked);

            // Emit event
            EventBus.emit("STAFF_CLOCKED_OUT", {
                timeEntryUuid: timeEntry.uuid,
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                hoursWorked,
                totalPay,
            });

            return updated;

        } catch (error: any) {
            logWithContext("error", "[TimeEntry] Clock out failed", {
                error: error.message,
                userUuid: input.userUuid,
            });

            MetricsService.increment("time_entry.clock_out.error", 1);

            throw error;
        }
    }

    static async startBreak(input: {
        timeEntryUuid: string;
        breakType: string;
    }) {
        // Check if already on break
        const activeBreak = await prisma.breakEntry.findFirst({
            where: {
                timeEntryUuid: input.timeEntryUuid,
                breakEnd: null,
            },
        });

        if (activeBreak) {
            throw new Error("ALREADY_ON_BREAK");
        }

        const timeEntry = await prisma.timeEntry.findUnique({
            where: { uuid: input.timeEntryUuid },
            include: { shift: true },
        });

        if (!timeEntry) {
            throw new Error("TIME_ENTRY_NOT_FOUND");
        };

        const breakEntry = await prisma.breakEntry.create({
            data: {
                timeEntryUuid: input.timeEntryUuid,
                shiftUuid: timeEntry.shiftUuid,
                breakStart: new Date(),
                breakType: input.breakType as any,
            },
        });

        logWithContext("info", "[TimeEntry] Break started", {
            breakEntryUuid: breakEntry.uuid,
            timeEntryUuid: input.timeEntryUuid,
        });

        return breakEntry;
    }

    static async endBreak(input: {
        breakEntryUuid: string;
    }) {
        const breakEntry = await prisma.breakEntry.findUnique({
            where: { uuid: input.breakEntryUuid },
        });

        if (!breakEntry) {
            throw new Error("BREAK_NOT_FOUND");
        }

        if (breakEntry.breakEnd) {
            throw new Error("BREAK_ALREADY_ENDED");
        }

        const duration = dayjs().diff(dayjs(breakEntry.breakStart), "minute");

        const updated = await prisma.breakEntry.update({
            where: { uuid: input.breakEntryUuid },
            data: {
                breakEnd: new Date(),
                duration,
            },
            });

            logWithContext("info", "[TimeEntry] Break ended", {
            breakEntryUuid: input.breakEntryUuid,
            duration,
        });

        return updated;
    }

    //Approve time entry (for late clock-ins, etc.)
    static async approveTimeEntry(input: {
        timeEntryUuid: string;
        approvedBy: string;
    }) {
        const timeEntry = await prisma.timeEntry.update({
            where: { uuid: input.timeEntryUuid },
            data: {
                requiresApproval: false,
                approvedBy: input.approvedBy,
                approvedAt: new Date(),
            },
        });

        logWithContext("info", "[TimeEntry] Time entry approved", {
            timeEntryUuid: input.timeEntryUuid,
            approvedBy: input.approvedBy,
        });

        return timeEntry;
    }

    static async handleSyncConflict(input: {
        timeEntryUuid: string;
        reason: string;
    }) {
        await prisma.timeEntry.update({
            where: { uuid: input.timeEntryUuid },
            data: {
                syncConflict: true,
                conflictReason: input.reason,
                requiresApproval: true,
            },
        });

        logWithContext("warn", "[TimeEntry] Sync conflict flagged", {
            timeEntryUuid: input.timeEntryUuid,
            reason: input.reason,
        });

        MetricsService.increment("time_entry.sync_conflict", 1);

        // Create approval request
        const timeEntry = await prisma.timeEntry.findUnique({
            where: { uuid: input.timeEntryUuid },
        });

        if (timeEntry) {
            await prisma.staffApprovalRequest.create({
                data: {
                    tenantUuid: timeEntry.tenantUuid,
                    storeUuid: timeEntry.storeUuid,
                    requestedBy: timeEntry.userUuid,
                    approvalType: "MISSED_CLOCK_OUT",
                    requestData: {
                        timeEntryUuid: input.timeEntryUuid,
                        reason: input.reason,
                    },
                    status: "PENDING",
                },
            });
        }
    }

    //Calculate distance between two coordinates (Haversine formula)
    private static calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
    ): number {
        const R = 6371000; // Earth's radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    static async getActiveTimeEntries(storeUuid: string) {
        return prisma.timeEntry.findMany({
            where: {
                storeUuid,
                clockOutAt: null,
            },
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                        profilePhoto: true,
                    },
                },
                breakEntries: {
                    where: { breakEnd: null },
                },
            },
            orderBy: { clockInAt: "asc" },
        });
    }

    //Get time entries for user (for payroll)
    static async getUserTimeEntries(input: {
        userUuid: string;
        periodStart: Date;
        periodEnd: Date;
    }) {
        return prisma.timeEntry.findMany({
            where: {
                userUuid: input.userUuid,
                clockInAt: {
                    gte: input.periodStart,
                    lte: input.periodEnd,
                },
            },
            include: {
                breakEntries: true,
                shift: {
                    select: {
                        scheduledStart: true,
                        scheduledEnd: true,
                        role: true,
                    },
                },
            },
            orderBy: { clockInAt: "asc" },
        });
    }
}