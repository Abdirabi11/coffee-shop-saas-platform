import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EventBus } from "../../events/eventBus.ts";


export class ShiftReminderJob {
  
    //Send reminders for upcoming shifts
    static async run() {
        logWithContext("info", "[ShiftReminder] Starting shift reminder job");

        try {
            // Get shifts starting in the next 2 hours
            const twoHoursFromNow = dayjs().add(2, "hour").toDate();
            const twoHoursAndFiveMin = dayjs().add(2, "hour").add(5, "minute").toDate();

            const upcomingShifts = await prisma.shift.findMany({
                where: {
                    scheduledStart: {
                        gte: twoHoursFromNow,
                        lte: twoHoursAndFiveMin,
                    },
                    status: "SCHEDULED",
                },
                include: {
                    user: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                            phoneNumber: true,
                            email: true,
                        },
                    },
                    store: {
                        select: {
                            uuid: true,
                            name: true,
                            address: true,
                        },
                    },
                },
            });

            let sent = 0;

            for (const shift of upcomingShifts) {
                try {
                    // Emit event for notification service
                    EventBus.emit("SHIFT_REMINDER", {
                        shiftUuid: shift.uuid,
                        userUuid: shift.userUuid,
                        userName: `${shift.user.firstName} ${shift.user.lastName}`,
                        storeName: shift.store.name,
                        scheduledStart: shift.scheduledStart,
                        email: shift.user.email,
                        phoneNumber: shift.user.phoneNumber,
                    });

                    sent++;

                } catch (error: any) {
                    logWithContext("error", "[ShiftReminder] Failed to send reminder", {
                        shiftUuid: shift.uuid,
                        error: error.message,
                    });
                }
            }

            logWithContext("info", "[ShiftReminder] Completed", {
                total: upcomingShifts.length,
                sent,
            });

            return { sent };

        } catch (error: any) {
            logWithContext("error", "[ShiftReminder] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}