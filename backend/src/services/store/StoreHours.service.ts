import type { DayOfWeek } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { storeLocalTime } from "../../utils/date.ts";


const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
 
export class StoreHoursService {
 
    // Check if store is currently open (handles exceptions + regular hours)
    static async isStoreOpen(storeUuid: string, now?: Date): Promise<boolean> {
        const current = now || new Date();
 
        try {
            // Opening hours are store wall-clock times: evaluate them in the
            // store's timezone, not the server's.
            const store = await prisma.store.findUnique({
                where: { uuid: storeUuid },
                select: { timezone: true },
            });
            if (!store) return false;

            const local = storeLocalTime(current, store.timezone);
            const currentTime = local.time; // "HH:mm"

            // Exception dates are calendar dates stored as UTC midnight
            // (new Date("2026-12-25")), so match the store's local date that way
            const todayStart = new Date(`${local.date}T00:00:00.000Z`);
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

            // 1. Check exceptions first (holidays, special hours)
            const exception = await prisma.storeHourException.findFirst({
                where: {
                    storeUuid,
                    exceptionDate: { gte: todayStart, lt: todayEnd },
                    isActive: true,
                },
            });
 
            if (exception) {
                if (exception.isClosed) return false;
                // Custom hours for this exception day
                if (exception.openTime && exception.closeTime) {
                    return currentTime >= exception.openTime && currentTime <= exception.closeTime;
                }
            }
 
            // 2. Check regular schedule
            const hours = await prisma.storeOpeningHour.findFirst({
                where: {
                    storeUuid,
                    dayOfWeek: local.dayName as DayOfWeek,
                    isActive: true,
                },
            });
 
            if (!hours || hours.isClosed) return false;
            if (hours.is24Hours) return true;
 
            return currentTime >= hours.openTime && currentTime <= hours.closeTime;
        } catch (error: any) {
            logWithContext("error", "[StoreHours] Check failed", { storeUuid, error: error.message });
            return false; // Fail closed
        }
    }
 
    // Set opening hours for a day
    static async setBulkHours(
        tenantUuid: string,
        storeUuid: string,
        schedule: Array<{
            dayOfWeek: string;
            openTime: string;
            closeTime: string;
            isClosed?: boolean;
            is24Hours?: boolean;
        }>
    ) {
        const results = [];
        for (const day of schedule) {
            const hours = await this.setHours(tenantUuid, storeUuid, day);
            results.push(hours);
        }
        return results;
    }

    static async setHours(
        tenantUuid: string,
        storeUuid: string,
        data: {
            dayOfWeek: string;
            openTime: string;
            closeTime: string;
            isClosed?: boolean;
            is24Hours?: boolean;
        }
    ) {
        const hours = await prisma.storeOpeningHour.upsert({
            where: {
                tenantUuid_storeUuid_dayOfWeek_scheduleType: {
                    tenantUuid,
                    storeUuid,
                    dayOfWeek: data.dayOfWeek as any,
                    scheduleType: "REGULAR",
                },
            },
            update: {
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
                is24Hours: data.is24Hours ?? false,
            },
            create: {
                tenantUuid,
                storeUuid,
                dayOfWeek: data.dayOfWeek as any,
                scheduleType: "REGULAR",
                periods: [],
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
                is24Hours: data.is24Hours ?? false,
                isActive: true,
            },
        });

        logWithContext("info", "[StoreHours] Hours set", {
            storeUuid,
            dayOfWeek: data.dayOfWeek,
            openTime: data.openTime,
            closeTime: data.closeTime,
        });

        return hours;
    }
 
    // Get all hours for a store
    static async getHours(storeUuid: string) {
        const hours = await prisma.storeOpeningHour.findMany({
            where: { storeUuid },
            orderBy: { dayOfWeek: "asc" },
        });
 
        // Return all 7 days, filling in missing ones as closed
        return DAY_NAMES.map((day) => {
            const found = hours.find((h) => h.dayOfWeek === day);
            return found || {
                dayOfWeek: day,
                openTime: null,
                closeTime: null,
                isClosed: true,
                is24Hours: false,
                isActive: false,
            };
        });
    }
 
    // Add exception (holiday, special event)
    static async addException(storeUuid: string, data: {
        exceptionDate: Date;
        reason: string;
        isClosed: boolean;
        openTime?: string;
        closeTime?: string;
    }) {
        return prisma.storeHourException.create({
            data: {
                storeUuid,
                exceptionDate: data.exceptionDate,
                reason: data.reason,
                isClosed: data.isClosed,
                openTime: data.openTime,
                closeTime: data.closeTime,
                isActive: true,
            },
        });
    }
 
    // List upcoming exceptions
    static async getExceptions(storeUuid: string) {
        return prisma.storeHourException.findMany({
            where: {
                storeUuid,
                isActive: true,
                exceptionDate: { gte: new Date() },
            },
            orderBy: { exceptionDate: "asc" },
        });
    }
 
    // Delete exception
    static async removeException(exceptionUuid: string) {
        return prisma.storeHourException.update({
            where: { uuid: exceptionUuid },
            data:  { isActive: false },
        });
    }
}