import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"

export class AutoClockOutJob {
  
    //Auto clock-out staff who forgot to clock out
    static async run() {
        logWithContext("info", "[AutoClockOut] Starting auto clock-out job");

        try {
            // Get time entries older than 12 hours without clock-out
            const twelveHoursAgo = dayjs().subtract(12, "hour").toDate();

            const stuckEntries = await prisma.timeEntry.findMany({
                where: {
                    clockOutAt: null,
                    clockInAt: {
                        lt: twelveHoursAgo,
                    },
                },
                include: {
                    user: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                    shift: true,
                },
            });

            let processed = 0;

            for (const entry of stuckEntries) {
                try {
                    // Calculate expected clock-out time
                    let expectedClockOut: Date;

                    if (entry.shift) {
                        // Use scheduled end time
                        expectedClockOut = entry.shift.scheduledEnd;
                    } else {
                        // Assume 8-hour shift
                        expectedClockOut = dayjs(entry.clockInAt).add(8, "hour").toDate();
                    }

                    // Update time entry
                    const hoursWorked = dayjs(expectedClockOut).diff(
                        dayjs(entry.clockInAt),
                        "hour",
                        true
                    );

                    await prisma.timeEntry.update({
                        where: { uuid: entry.uuid },
                        data: {
                            clockOutAt: expectedClockOut,
                            hoursWorked: Number(hoursWorked.toFixed(2)),
                            requiresApproval: true,
                            approvalReason: "Auto-clocked out after 12 hours",
                        },
                    });

                    // Create approval request
                    await prisma.staffApprovalRequest.create({
                        data: {
                            tenantUuid: entry.tenantUuid,
                            storeUuid: entry.storeUuid,
                            requestedBy: entry.userUuid,
                            approvalType: "MISSED_CLOCK_OUT",
                            requestData: {
                                timeEntryUuid: entry.uuid,
                                clockInAt: entry.clockInAt,
                                autoClockOutAt: expectedClockOut,
                            },
                            status: "PENDING",
                        },
                    });

                    processed++;

                    logWithContext("warn", "[AutoClockOut] Auto-clocked out staff", {
                        userUuid: entry.userUuid,
                        userName: `${entry.user.firstName} ${entry.user.lastName}`,
                        clockInAt: entry.clockInAt,
                        clockOutAt: expectedClockOut,
                    });

                } catch (error: any) {
                    logWithContext("error", "[AutoClockOut] Failed to process entry", {
                        entryUuid: entry.uuid,
                        error: error.message,
                    });
                }
            }

            logWithContext("info", "[AutoClockOut] Completed", {
                total: stuckEntries.length,
                processed,
            });

            return { processed };

        } catch (error: any) {
            logWithContext("error", "[AutoClockOut] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}