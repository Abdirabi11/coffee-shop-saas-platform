import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import prisma from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { EventBus } from "../../events/eventBus.ts";


export class BreakEnforcementService {
  
    //Create standard world break policies
    static async createStandardPolicies(input: {
        tenantUuid: string;
        storeUuid?: string;
    }) {
        const policies = [];

        // Policy 1: 30-min unpaid break for 6+ hour shifts
        const policy1 = await prisma.breakPolicy.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: "6-Hour Break",
                description: "30-minute unpaid break for shifts 6 hours or longer",
                minShiftHours: 6,
                breakType: "MEAL",
                breakDuration: 30,
                isPaid: false,
                isRequired: true,
                reminderMinutes: 15,
                allowSkip: false,
                isActive: true,
                priority: 1,
            },
        });
        policies.push(policy1);

        // Policy 2: 15-min paid break for 4+ hour shifts
        const policy2 = await prisma.breakPolicy.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: "4-Hour Break",
                description: "15-minute paid break for shifts 4 hours or longer",
                minShiftHours: 4,
                breakType: "PAID",
                breakDuration: 15,
                isPaid: true,
                isRequired: true,
                reminderMinutes: 10,
                allowSkip: false,
                isActive: true,
                priority: 2,
            },
        });
        policies.push(policy2);

        // Policy 3: Second 15-min break for 8+ hour shifts
        const policy3 = await prisma.breakPolicy.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                name: "8-Hour Second Break",
                description: "Additional 15-minute paid break for shifts 8 hours or longer",
                minShiftHours: 8,
                breakType: "PAID",
                breakDuration: 15,
                isPaid: true,
                isRequired: true,
                reminderMinutes: 10,
                allowSkip: false,
                isActive: true,
                priority: 3,
            },
        });
        policies.push(policy3);

        logWithContext("info", "[BreakEnforcement] Standard policies created", {
            tenantUuid: input.tenantUuid,
            count: policies.length,
        });

        return policies;
    }

    static async checkBreakRequirement(timeEntryUuid: string) {
        const timeEntry = await prisma.timeEntry.findUnique({
            where: { uuid: timeEntryUuid },
            include: {
                breakEntries: true,
            },
        });

        if (!timeEntry) {
            throw new Error("TIME_ENTRY_NOT_FOUND");
        };

        // Calculate hours worked so far
        const hoursWorked = dayjs().diff(dayjs(timeEntry.clockInAt), "hour", true);

        // Get applicable break policies
        const policies = await prisma.breakPolicy.findMany({
            where: {
                OR: [
                    { tenantUuid: timeEntry.tenantUuid, storeUuid: null },
                    { storeUuid: timeEntry.storeUuid },
                ],
                isActive: true,
                minShiftHours: { lte: hoursWorked },
            },
            orderBy: { priority: "asc" },
        });

        const requiredBreaks = [];
        const missedBreaks = [];

        for (const policy of policies) {
            // Check if this break has been taken
            const breakTaken = timeEntry.breakEntries.find(
                (b) => b.breakType === policy.breakType && b.duration && b.duration >= policy.breakDuration
            );

            // Calculate when break should have been taken
            const expectedBreakAt = dayjs(timeEntry.clockInAt)
                .add(policy.minShiftHours, "hour")
                .toDate();

            if (!breakTaken) {
                // Check if we're past the expected break time
                if (dayjs().isAfter(expectedBreakAt)) {
                    missedBreaks.push({
                        policy,
                        expectedBreakAt,
                        hoursWorked,
                    });
                } else {
                    requiredBreaks.push({
                        policy,
                        expectedBreakAt,
                        hoursWorked,
                        minutesUntilRequired: dayjs(expectedBreakAt).diff(dayjs(), "minute"),
                    });
                }
            }
        }

        return {
            requiredBreaks,
            missedBreaks,
            hoursWorked,
        };
    }

    static async createViolation(input: {
        timeEntryUuid: string;
        userUuid: string;
        storeUuid: string;
        breakPolicyUuid: string;
        violationType: string;
        expectedBreakAt: Date;
        actualBreakAt?: Date;
        hoursWorked: number;
    }) {
        const violation = await prisma.breakViolation.create({
            data: {
                timeEntryUuid: input.timeEntryUuid,
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                breakPolicyUuid: input.breakPolicyUuid,
                violationType: input.violationType as any,
                expectedBreakAt: input.expectedBreakAt,
                actualBreakAt: input.actualBreakAt,
                hoursWorked: input.hoursWorked,
            },
        });

        logWithContext("warn", "[BreakEnforcement] Violation created", {
            violationUuid: violation.uuid,
            userUuid: input.userUuid,
            violationType: input.violationType,
        });

        MetricsService.increment("break.violation", 1, {
            type: input.violationType,
        });

        // Emit event for manager notification
        EventBus.emit("BREAK_VIOLATION", {
            violationUuid: violation.uuid,
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            violationType: input.violationType,
        });

        return violation;
    }

    static async sendBreakReminder(input: {
        timeEntryUuid: string;
        policy: any;
    }) {
        const timeEntry = await prisma.timeEntry.findUnique({
            where: { uuid: input.timeEntryUuid },
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        if (!timeEntry) return;

        EventBus.emit("BREAK_REMINDER", {
            timeEntryUuid: input.timeEntryUuid,
            userUuid: timeEntry.userUuid,
            userName: `${timeEntry.user.firstName} ${timeEntry.user.lastName}`,
            storeUuid: timeEntry.storeUuid,
            breakType: input.policy.breakType,
            breakDuration: input.policy.breakDuration,
            isPaid: input.policy.isPaid,
        });

        logWithContext("info", "[BreakEnforcement] Reminder sent", {
            timeEntryUuid: input.timeEntryUuid,
            userUuid: timeEntry.userUuid,
            breakType: input.policy.breakType,
        });
    }

    static async monitorActiveEntries(storeUuid: string) {
        const activeEntries = await prisma.timeEntry.findMany({
            where: {
                storeUuid,
                clockOutAt: null,
            },
        });

        const results = {
            monitored: activeEntries.length,
            remindersNeeded: 0,
            violationsCreated: 0,
        };

        for (const entry of activeEntries) {
            const check = await this.checkBreakRequirement(entry.uuid);

            // Send reminders for upcoming required breaks
            for (const required of check.requiredBreaks) {
                if (required.minutesUntilRequired <= required.policy.reminderMinutes) {
                    await this.sendBreakReminder({
                        timeEntryUuid: entry.uuid,
                        policy: required.policy,
                    });
                    results.remindersNeeded++;
                }
            }

            // Create violations for missed breaks
            for (const missed of check.missedBreaks) {
                // Check if violation already exists
                const existingViolation = await prisma.breakViolation.findFirst({
                    where: {
                        timeEntryUuid: entry.uuid,
                        breakPolicyUuid: missed.policy.uuid,
                    },
                });

                if (!existingViolation) {
                    await this.createViolation({
                        timeEntryUuid: entry.uuid,
                        userUuid: entry.userUuid,
                        storeUuid: entry.storeUuid,
                        breakPolicyUuid: missed.policy.uuid,
                        violationType: "MISSED_BREAK",
                        expectedBreakAt: missed.expectedBreakAt,
                        hoursWorked: missed.hoursWorked,
                    });
                    results.violationsCreated++;
                }
            }
        }

        return results;
    }

    static async acknowledgeViolation(input: {
        violationUuid: string;
        acknowledgedBy: string;
    }) {
        const violation = await prisma.breakViolation.update({
            where: { uuid: input.violationUuid },
            data: {
                acknowledged: true,
                acknowledgedBy: input.acknowledgedBy,
                acknowledgedAt: new Date(),
            },
        });

        logWithContext("info", "[BreakEnforcement] Violation acknowledged", {
            violationUuid: input.violationUuid,
            acknowledgedBy: input.acknowledgedBy,
        });

        return violation;
    }

    static async waiveViolation(input: {
        violationUuid: string;
        waivedBy: string;
        reason: string;
    }) {
        const violation = await prisma.breakViolation.update({
            where: { uuid: input.violationUuid },
            data: {
                waived: true,
                waivedBy: input.waivedBy,
                waivedReason: input.reason,
            },
        });

        logWithContext("info", "[BreakEnforcement] Violation waived", {
            violationUuid: input.violationUuid,
            waivedBy: input.waivedBy,
            reason: input.reason,
        });

        return violation;
    }

    //Get violations for store
    static async getViolations(input: {
        storeUuid: string;
        userUuid?: string;
        acknowledged?: boolean;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: any = {
            storeUuid: input.storeUuid,
        };

        if (input.userUuid) {
            where.userUuid = input.userUuid;
        }

        if (input.acknowledged !== undefined) {
            where.acknowledged = input.acknowledged;
        }

        if (input.dateFrom || input.dateTo) {
            where.createdAt = {};
            if (input.dateFrom) where.createdAt.gte = input.dateFrom;
            if (input.dateTo) where.createdAt.lte = input.dateTo;
        }

        return prisma.breakViolation.findMany({
            where,
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                breakPolicy: true,
            },
            orderBy: { createdAt: "desc" },
        });
    }
}