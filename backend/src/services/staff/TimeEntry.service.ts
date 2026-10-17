import dayjs from "dayjs";
import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EventBus } from "../../events/eventBus.ts";
import { StoreStatusService } from "../store/StoreStatus.service.ts";

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

            // 2. The store must be operating
            await StoreStatusService.assertOperational(input.storeUuid);

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

            // 4-6. Under a lock on the user's row, so two clock-ins can't both
            // pass the checks: one open time entry per person across every
            // store (being clocked in at two stores at once is paid twice),
            // and a shift only if it is theirs, at this store, and not
            // already worked.
            const timeEntry = await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT 1 FROM "User" WHERE "uuid" = ${input.userUuid} FOR UPDATE`;

                const existingEntry = await tx.timeEntry.findFirst({
                    where: { userUuid: input.userUuid, clockOutAt: null },
                    select: { storeUuid: true },
                });
                if (existingEntry) {
                    throw new Error(existingEntry.storeUuid === input.storeUuid
                        ? "ALREADY_CLOCKED_IN"
                        : "ALREADY_CLOCKED_IN_ELSEWHERE");
                }

                // Check if late (if scheduled shift exists)
                let requiresApproval = false;
                let approvalReason: string | undefined;
                let shift;

                if (input.shiftUuid) {
                    shift = await tx.shift.findFirst({
                        where: { uuid: input.shiftUuid, userUuid: input.userUuid, storeUuid: input.storeUuid },
                    });
                    if (!shift || shift.status !== "SCHEDULED") {
                        throw new Error("SHIFT_NOT_FOUND");
                    }

                    const scheduledStart = dayjs(shift.scheduledStart);
                    const actualStart = dayjs();
                    const minutesLate = actualStart.diff(scheduledStart, "minute");

                    if (minutesLate > 5) {
                        // Late by more than 5 minutes
                        requiresApproval = true;
                        approvalReason = `Clocked in ${minutesLate} minutes late`;
                    }
                }

                // Get pay rate
                const tenantUser = await tx.tenantUser.findUnique({
                    where: {
                        tenantUuid_userUuid: {
                            tenantUuid: userStore.tenantUuid,
                            userUuid: input.userUuid,
                        },
                    },
                });

                // Create time entry
                const timeEntry = await tx.timeEntry.create({
                    data: {
                        tenantUuid: userStore.tenantUuid,
                        storeUuid: input.storeUuid,
                        userUuid: input.userUuid,
                        shiftUuid: shift?.uuid,
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

                // Update shift status
                if (shift) {
                    await tx.shift.update({
                        where: { uuid: shift.uuid },
                        data: {
                            status: "IN_PROGRESS",
                            actualStart: new Date(),
                        },
                    });
                };

                return timeEntry;
            });

            logWithContext("info", "[TimeEntry] Clock in successful", {
                timeEntryUuid: timeEntry.uuid,
                userUuid: input.userUuid,
                requiresApproval: timeEntry.requiresApproval,
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
                requiresApproval: timeEntry.requiresApproval,
            });

            return {
                timeEntry,
                requiresApproval: timeEntry.requiresApproval,
                approvalReason: timeEntry.approvalReason,
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

            const { updated, hoursWorked, totalPay } = await this.closeEntry(prisma, timeEntry, {
                at: new Date(),
                deviceId: input.deviceId,
                latitude: input.latitude,
                longitude: input.longitude,
                distanceFromStore,
            });

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

    // Clock-out bookkeeping for an open entry: hours, breaks, pay, and the
    // shift it belongs to. Shared by clockOut and by access revocation
    // (removed staff are clocked out), which passes its transaction and an
    // autoReason; that entry is flagged for approval rather than taken as
    // the person's own clock-out. A break still open is ended at `at`.
    static async closeEntry(
        client: Prisma.TransactionClient,
        timeEntry: { uuid: string; clockInAt: Date; payRate: number | null; shiftUuid: string | null },
        data: {
            at: Date;
            deviceId?: string;
            latitude?: number;
            longitude?: number;
            distanceFromStore?: number;
            autoReason?: string;
        }
    ) {
        await client.breakEntry.updateMany({
            where: { timeEntryUuid: timeEntry.uuid, breakEnd: null },
            data: { breakEnd: data.at },
        });

        // Break time: all of it is recorded; only UNPAID and MEAL breaks come
        // off the paid hours (PAID rest breaks are working time)
        const breaks = await client.breakEntry.findMany({
            where: { timeEntryUuid: timeEntry.uuid },
            select: { breakStart: true, breakEnd: true, breakType: true },
        });
        let totalBreakMinutes = 0;
        let unpaidBreakMinutes = 0;
        for (const b of breaks) {
            if (!b.breakEnd) continue;
            const minutes = dayjs(b.breakEnd).diff(dayjs(b.breakStart), "minute", true);
            totalBreakMinutes += minutes;
            if (b.breakType !== "PAID") unpaidBreakMinutes += minutes;
        }

        // Paid hours: time on the clock minus unpaid breaks. hoursWorked is
        // what payroll (PayrollExport) sums, so it holds paid hours.
        const elapsedHours = dayjs(data.at).diff(dayjs(timeEntry.clockInAt), "hour", true);
        const hoursWorked = Math.max(0, elapsedHours - unpaidBreakMinutes / 60);

        // Calculate pay
        const payRate = timeEntry.payRate || 0;
        const totalPay = Math.round(hoursWorked * payRate);

        // Update time entry
        const updated = await client.timeEntry.update({
            where: { uuid: timeEntry.uuid },
            data: {
                clockOutAt: data.at,
                clockOutDevice: data.deviceId ?? (data.autoReason ? "SYSTEM" : undefined),
                clockOutLat: data.latitude,
                clockOutLng: data.longitude,
                clockOutDistanceM: data.distanceFromStore,
                hoursWorked: Number(hoursWorked.toFixed(2)),
                breakMinutes: Math.round(totalBreakMinutes),
                totalPay,
                ...(data.autoReason && { requiresApproval: true, approvalReason: data.autoReason }),
            },
        });

        // Update shift status
        if (timeEntry.shiftUuid) {
            await client.shift.update({
                where: { uuid: timeEntry.shiftUuid },
                data: {
                    status: "COMPLETED",
                    actualEnd: data.at,
                },
            });
        }

        return { updated, hoursWorked, totalPay };
    }

    static async startBreak(input: {
        timeEntryUuid: string;
        breakType: string;
        userUuid: string; // the caller; only their own time entry
    }) {
        // Someone else's (or no) entry reads as not found
        const owned = await prisma.timeEntry.findFirst({
            where: { uuid: input.timeEntryUuid, userUuid: input.userUuid },
            select: { uuid: true, clockOutAt: true },
        });
        if (!owned) {
            throw new Error("TIME_ENTRY_NOT_FOUND");
        }
        // A break belongs inside a shift that is still on the clock
        if (owned.clockOutAt) {
            throw new Error("NOT_CLOCKED_IN");
        }

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
        userUuid: string; // the caller; only their own break
    }) {
        // Someone else's break reads as not found
        const breakEntry = await prisma.breakEntry.findFirst({
            where: { uuid: input.breakEntryUuid, timeEntry: { userUuid: input.userUuid } },
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
        tenantUuid: string;
        timeEntryUuid: string;
        approvedBy: string;
    }) {
        const existing = await prisma.timeEntry.findFirst({
            where: { uuid: input.timeEntryUuid, tenantUuid: input.tenantUuid },
            select: { userUuid: true },
        });
        if (!existing) {
            throw new Error("TIME_ENTRY_NOT_FOUND");
        }
        // Nobody signs off their own hours
        if (existing.userUuid === input.approvedBy) {
            throw new Error("TIME_ENTRY_SELF_APPROVE");
        }

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
    // storeUuids limits the result to those stores (undefined = every store in
    // the tenant). Pay (payRate snapshot, totalPay) only when includePay.
    static async getUserTimeEntries(input: {
        tenantUuid: string;
        userUuid: string;
        periodStart: Date;
        periodEnd: Date;
        storeUuids?: string[];
        includePay: boolean;
    }) {
        return prisma.timeEntry.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                userUuid: input.userUuid,
                ...(input.storeUuids && { storeUuid: { in: input.storeUuids } }),
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
            omit: { payRate: !input.includePay, totalPay: !input.includePay },
            orderBy: { clockInAt: "asc" },
        });
    }
}