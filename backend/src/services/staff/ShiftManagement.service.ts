import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EventBus } from "../../events/eventBus.ts";
import { invalidateCache, withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class ShiftManagementService {
  
    static async createShift(input: {
        tenantUuid: string;
        storeUuid: string;
        userUuid: string;
        role: string;
        scheduledStart: Date;
        scheduledEnd: Date;
        shiftType?: string;
        requiredBreaks?: number;
        breakDuration?: number;
        notes?: string;
    }) {
        try {
            // Validate user has access to store
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
            };

            // Check for conflicts
            const conflicts = await this.checkShiftConflicts({
                userUuid: input.userUuid,
                scheduledStart: input.scheduledStart,
                scheduledEnd: input.scheduledEnd,
            });

            if (conflicts.length > 0) {
                throw new Error("SHIFT_CONFLICT_EXISTS");
            };

            // Calculate required breaks based on shift length
            const shiftHours = dayjs(input.scheduledEnd).diff(
                dayjs(input.scheduledStart),
                "hour",
                true
            );

            let requiredBreaks = input.requiredBreaks ?? 0;
            if (shiftHours >= 8) {
                requiredBreaks = Math.max(requiredBreaks, 2); // 2 breaks for 8+ hour shift
            } else if (shiftHours >= 6) {
                requiredBreaks = Math.max(requiredBreaks, 1); // 1 break for 6+ hour shift
            };

            const shift = await prisma.shift.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    userUuid: input.userUuid,
                    role: (input.role as any) || userStore.role,
                    scheduledStart: input.scheduledStart,
                    scheduledEnd: input.scheduledEnd,
                    shiftType: (input.shiftType as any) || "REGULAR",
                    requiredBreaks,
                    breakDuration: input.breakDuration || 30,
                    status: "SCHEDULED",
                    notes: input.notes,
                },
            });

            logWithContext("info", "[Shift] Shift created", {
                shiftUuid: shift.uuid,
                userUuid: input.userUuid,
                scheduledStart: input.scheduledStart,
            });

            MetricsService.increment("shift.created", 1, {
                storeUuid: input.storeUuid,
            });

            // Invalidate cache
            await invalidateCache(`shifts:store:${input.storeUuid}:${dayjs(input.scheduledStart).format("YYYY-MM-DD")}`);
            await invalidateCache(`shifts:user:${input.userUuid}`);

            // Emit event
            EventBus.emit("SHIFT_CREATED", {
                shiftUuid: shift.uuid,
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
            });

            return shift;

        } catch (error: any) {
            logWithContext("error", "[Shift] Failed to create shift", {
                error: error.message,
            });
            throw error;
        }
    }

    //Get shifts for a store on a specific date (for offline caching)
    static async getStoreShifts(input: {
        storeUuid: string;
        date: Date;
    }) {
        const cacheKey = `shifts:store:${input.storeUuid}:${dayjs(input.date).format("YYYY-MM-DD")}`;

        return withCache(cacheKey, 300, async () => {
            const startOfDay = dayjs(input.date).startOf("day").toDate();
            const endOfDay = dayjs(input.date).endOf("day").toDate();

            const shifts = await prisma.shift.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    scheduledStart: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                    status: { notIn: ["CANCELLED"] },
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
                    timeEntry: {
                        select: {
                            uuid: true,
                            clockInAt: true,
                            clockOutAt: true,
                            hoursWorked: true,
                        },
                    },
                },
                orderBy: { scheduledStart: "asc" },
            });

            return shifts.map((shift) => ({
                uuid: shift.uuid,
                userUuid: shift.userUuid,
                firstName: shift.user.firstName,
                lastName: shift.user.lastName,
                profilePhoto: shift.user.profilePhoto,
                role: shift.role,
                scheduledStart: shift.scheduledStart,
                scheduledEnd: shift.scheduledEnd,
                status: shift.status,
                actualStart: shift.actualStart,
                actualEnd: shift.actualEnd,
                requiredBreaks: shift.requiredBreaks,
                breakDuration: shift.breakDuration,
                timeEntry: shift.timeEntry,
            }));
        });
    }

    static async getUserShifts(input: {
        userUuid: string;
        daysAhead?: number;
    }) {
        const cacheKey = `shifts:user:${input.userUuid}`;

        return withCache(cacheKey, 300, async () => {
            const now = new Date();
            const futureDate = dayjs().add(input.daysAhead || 7, "day").toDate();

            return prisma.shift.findMany({
                where: {
                    userUuid: input.userUuid,
                    scheduledStart: {
                        gte: now,
                        lte: futureDate,
                    },
                    status: { notIn: ["CANCELLED"] },
                },
                include: {
                    store: {
                        select: {
                            uuid: true,
                            name: true,
                            address: true,
                            latitude: true,
                            longitude: true,
                        },
                    },
                },
                orderBy: { scheduledStart: "asc" },
            });
        });
    }

    static async updateShift(input: {
        shiftUuid: string;
        scheduledStart?: Date;
        scheduledEnd?: Date;
        role?: string;
        status?: string;
        notes?: string;
    }) {
        const shift = await prisma.shift.findUnique({
            where: { uuid: input.shiftUuid },
        });

        if (!shift) {
            throw new Error("SHIFT_NOT_FOUND");
        };

        // If rescheduling, check for conflicts
        if (input.scheduledStart || input.scheduledEnd) {
            const conflicts = await this.checkShiftConflicts({
                userUuid: shift.userUuid,
                scheduledStart: input.scheduledStart || shift.scheduledStart,
                scheduledEnd: input.scheduledEnd || shift.scheduledEnd,
                excludeShiftUuid: input.shiftUuid,
            });

            if (conflicts.length > 0) {
                throw new Error("SHIFT_CONFLICT_EXISTS");
            }
        };

        const updated = await prisma.shift.update({
            where: { uuid: input.shiftUuid },
            data: {
                scheduledStart: input.scheduledStart,
                scheduledEnd: input.scheduledEnd,
                role: input.role as any,
                status: input.status as any,
                notes: input.notes,
            },
        });

        // Invalidate cache
        await invalidateCache(`shifts:store:${shift.storeUuid}:${dayjs(shift.scheduledStart).format("YYYY-MM-DD")}`);
        await invalidateCache(`shifts:user:${shift.userUuid}`);

        return updated;
    }

    static async cancelShift(input: {
        shiftUuid: string;
        reason?: string;
    }) {
        const shift = await prisma.shift.update({
            where: { uuid: input.shiftUuid },
            data: {
                status: "CANCELLED",
                notes: input.reason,
            },
        });

        logWithContext("info", "[Shift] Shift cancelled", {
            shiftUuid: input.shiftUuid,
            reason: input.reason,
        });

        // Invalidate cache
        await invalidateCache(`shifts:store:${shift.storeUuid}:${dayjs(shift.scheduledStart).format("YYYY-MM-DD")}`);
        await invalidateCache(`shifts:user:${shift.userUuid}`);

        // Emit event
        EventBus.emit("SHIFT_CANCELLED", {
            shiftUuid: shift.uuid,
            userUuid: shift.userUuid,
            storeUuid: shift.storeUuid,
        });

        return shift;
    }

    static async requestShiftSwap(input: {
        shiftUuid: string;
        requestedBy: string;
        requestedWith?: string; // Specific person to swap with
        reason: string;
    }) {
        const shift = await prisma.shift.findUnique({
            where: { uuid: input.shiftUuid },
        });

        if (!shift) {
            throw new Error("SHIFT_NOT_FOUND");
        }

        if (shift.userUuid !== input.requestedBy) {
            throw new Error("NOT_YOUR_SHIFT");
        }

        if (shift.status !== "SCHEDULED") {
            throw new Error("SHIFT_NOT_SWAPPABLE");
        }

        const swapRequest = await prisma.shiftSwapRequest.create({
            data: {
                shiftUuid: input.shiftUuid,
                requestedBy: input.requestedBy,
                requestedWith: input.requestedWith,
                reason: input.reason,
                status: "PENDING",
            },
        });

        logWithContext("info", "[Shift] Swap request created", {
            shiftUuid: input.shiftUuid,
            requestedBy: input.requestedBy,
        });

        // Emit event
        EventBus.emit("SHIFT_SWAP_REQUESTED", {
            swapRequestUuid: swapRequest.uuid,
            shiftUuid: input.shiftUuid,
            requestedBy: input.requestedBy,
        });

        return swapRequest;
    }

    static async respondToShiftSwap(input: {
        swapRequestUuid: string;
        managerUuid: string;
        approved: boolean;
        notes?: string;
    }) {
        const swapRequest = await prisma.shiftSwapRequest.update({
            where: { uuid: input.swapRequestUuid },
            data: {
                status: input.approved ? "APPROVED" : "REJECTED",
                managerApproved: input.approved,
                managerUuid: input.managerUuid,
                managerNotes: input.notes,
                respondedAt: new Date(),
            },
        });

        logWithContext("info", "[Shift] Swap request responded", {
            swapRequestUuid: input.swapRequestUuid,
            approved: input.approved,
        });

        return swapRequest;
    }

    private static async checkShiftConflicts(input: {
        userUuid: string;
        scheduledStart: Date;
        scheduledEnd: Date;
        excludeShiftUuid?: string;
    }) {
        const where: any = {
            userUuid: input.userUuid,
            status: { notIn: ["CANCELLED"] },
            OR: [
                {
                    // New shift starts during existing shift
                    scheduledStart: {
                        lte: input.scheduledStart,
                    },
                    scheduledEnd: {
                        gte: input.scheduledStart,
                    },
                },
                {
                    // New shift ends during existing shift
                    scheduledStart: {
                        lte: input.scheduledEnd,
                    },
                    scheduledEnd: {
                        gte: input.scheduledEnd,
                    },
                },
                {
                    // New shift completely contains existing shift
                    scheduledStart: {
                        gte: input.scheduledStart,
                    },
                    scheduledEnd: {
                        lte: input.scheduledEnd,
                    },
                },
            ],
        };

        if (input.excludeShiftUuid) {
            where.uuid = { not: input.excludeShiftUuid };
        };

        return prisma.shift.findMany({ where });
    }

    static async markNoShow(input: {
        shiftUuid: string;
        markedBy: string;
    }) {
        const shift = await prisma.shift.update({
            where: { uuid: input.shiftUuid },
            data: { status: "NO_SHOW" },
        });

        logWithContext("warn", "[Shift] Marked as no-show", {
            shiftUuid: input.shiftUuid,
            userUuid: shift.userUuid,
        });

        MetricsService.increment("shift.no_show", 1, {
            storeUuid: shift.storeUuid,
        });

        return shift;
    }

    static async getShiftCoverage(input: {
        storeUuid: string;
        date: Date;
    }) {
        const shifts = await this.getStoreShifts({
            storeUuid: input.storeUuid,
            date: input.date,
        });

        // Define shift periods
        const morning = { start: 6, end: 14 }; // 6 AM - 2 PM
        const afternoon = { start: 14, end: 22 }; // 2 PM - 10 PM
        const evening = { start: 22, end: 6 }; // 10 PM - 6 AM (next day)

        const coverage = {
            morning: shifts.filter((s) => {
                const hour = dayjs(s.scheduledStart).hour();
                return hour >= morning.start && hour < morning.end;
            }),
            afternoon: shifts.filter((s) => {
                const hour = dayjs(s.scheduledStart).hour();
                return hour >= afternoon.start && hour < afternoon.end;
            }),
            evening: shifts.filter((s) => {
                const hour = dayjs(s.scheduledStart).hour();
                return hour >= evening.start || hour < evening.end;
            }),
        };

        return coverage;
    }

}