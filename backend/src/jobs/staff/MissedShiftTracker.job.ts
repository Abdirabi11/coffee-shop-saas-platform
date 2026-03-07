import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"
import { ShiftManagementService } from "../../services/staff/ShiftManagement.service.ts";

export class MissedShiftTrackerJob {
    //Mark shifts as no-show if staff didn't clock in

    static async run() {
        logWithContext("info", "[MissedShift] Starting missed shift tracker");

        try {
            // Get shifts that started 30+ minutes ago but are still "SCHEDULED"
            const thirtyMinutesAgo = dayjs().subtract(30, "minute").toDate();

            const missedShifts = await prisma.shift.findMany({
                where: {
                    scheduledStart: {
                        lt: thirtyMinutesAgo,
                    },
                    status: "SCHEDULED",
                },
                include: {
                    user: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                    timeEntry: true,
                },
            });

            let marked = 0;

            for (const shift of missedShifts) {
                // Check if they have a time entry (even if not linked to this shift)
                const anyTimeEntry = await prisma.timeEntry.findFirst({
                    where: {
                        userUuid: shift.userUuid,
                        storeUuid: shift.storeUuid,
                        clockInAt: {
                            gte: dayjs(shift.scheduledStart).subtract(15, "minute").toDate(),
                            lte: dayjs(shift.scheduledStart).add(30, "minute").toDate(),
                        },
                    },
                });

                if (!anyTimeEntry) {
                    // Mark as no-show
                    await ShiftManagementService.markNoShow({
                        shiftUuid: shift.uuid,
                        markedBy: "SYSTEM",
                    });

                    marked++;

                    logWithContext("warn", "[MissedShift] Marked as no-show", {
                        shiftUuid: shift.uuid,
                        userUuid: shift.userUuid,
                        userName: `${shift.user.firstName} ${shift.user.lastName}`,
                        scheduledStart: shift.scheduledStart,
                    });
                }
            }

            logWithContext("info", "[MissedShift] Completed", {
                total: missedShifts.length,
                marked,
            });

            return { marked };

        } catch (error: any) {
            logWithContext("error", "[MissedShift] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}