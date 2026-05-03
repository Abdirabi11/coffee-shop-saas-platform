import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";


const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
 
export class StoreHoursService {
 
    // Check if store is currently open (handles exceptions + regular hours)
    static async isStoreOpen(storeUuid: string, now?: Date): Promise<boolean> {
        const current = now || new Date();
        const dayOfWeek = current.getDay();
        const currentTime = current.toTimeString().slice(0, 5); // "HH:mm"
        const todayStart = dayjs(current).startOf("day").toDate();
        const todayEnd = dayjs(current).endOf("day").toDate();
 
        try {
            // 1. Check exceptions first (holidays, special hours)
            const exception = await prisma.storeHourException.findFirst({
                where: {
                    storeUuid,
                    exceptionDate: { gte: todayStart, lt: todayEnd },
                    active: true,
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
                    dayOfWeek: DAY_NAMES[dayOfWeek],
                    active: true,
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
    static async setHours(storeUuid: string, data: {
        dayOfWeek: string;
        openTime: string;
        closeTime: string;
        isClosed?: boolean;
        is24Hours?: boolean;
    }) {
        const hours = await prisma.storeOpeningHour.upsert({
            where: {
                storeUuid_dayOfWeek: {
                    storeUuid,
                    dayOfWeek: data.dayOfWeek,
                },
            },
            update: {
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
                is24Hours: data.is24Hours ?? false,
            },
            create: {
                storeUuid,
                dayOfWeek: data.dayOfWeek,
                openTime: data.openTime,
                closeTime: data.closeTime,
                isClosed: data.isClosed ?? false,
                is24Hours: data.is24Hours ?? false,
                active: true,
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
 
    // Set hours for all 7 days at once
    static async setBulkHours(storeUuid: string, schedule: Array<{
        dayOfWeek: string;
        openTime: string;
        closeTime: string;
        isClosed?: boolean;
        is24Hours?: boolean;
    }>) {
        const results = [];
        for (const day of schedule) {
            const hours = await this.setHours(storeUuid, day);
            results.push(hours);
        }
        return results;
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
                active: false,
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
                active: true,
            },
        });
    }
 
    // List upcoming exceptions
    static async getExceptions(storeUuid: string) {
        return prisma.storeHourException.findMany({
            where: {
                storeUuid,
                active: true,
                exceptionDate: { gte: new Date() },
            },
            orderBy: { exceptionDate: "asc" },
        });
    }
 
    // Delete exception
    static async removeException(exceptionUuid: string) {
        return prisma.storeHourException.update({
            where: { uuid: exceptionUuid },
            data: { active: false },
        });
    }
}