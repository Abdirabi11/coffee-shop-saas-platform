import type { DayOfWeek, ExceptionType, Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { storeLocalTime } from "../../utils/date.ts";
import { StoreStatusService } from "./StoreStatus.service.ts";


const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

// An exception day's own opening window, stored in StoreHourException.customHours
type ExceptionHours = { openTime: string; closeTime: string };

function exceptionHours(customHours: Prisma.JsonValue | null): ExceptionHours | null {
    if (!customHours || typeof customHours !== "object" || Array.isArray(customHours)) return null;
    const { openTime, closeTime } = customHours as Record<string, unknown>;
    if (typeof openTime !== "string" || typeof closeTime !== "string") return null;
    return { openTime, closeTime };
}
 
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

            // A deactivated/suspended store (or tenant) is closed whatever its hours
            if (!(await StoreStatusService.isOperational(storeUuid))) return false;

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
                if (exception.is24Hours) return true;
                // Custom hours for this exception day
                const custom = exceptionHours(exception.customHours);
                if (custom) {
                    return currentTime >= custom.openTime && currentTime <= custom.closeTime;
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
            // An open day with no times set can't be evaluated: treat as closed
            if (!hours.openTime || !hours.closeTime) return false;
 
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
    // `reason` is stored as the exception's name. Custom hours (an open day
    // with its own window) go in customHours. Added by a store owner/admin,
    // so it takes effect at once (isApproved).
    static async addException(tenantUuid: string, storeUuid: string, data: {
        exceptionDate: Date;
        reason: string;
        isClosed: boolean;
        openTime?: string;
        closeTime?: string;
        exceptionType?: ExceptionType;
        createdBy?: string;
    }) {
        const customHours: ExceptionHours | undefined =
            !data.isClosed && data.openTime && data.closeTime
                ? { openTime: data.openTime, closeTime: data.closeTime }
                : undefined;

        return prisma.storeHourException.create({
            data: {
                tenantUuid,
                storeUuid,
                exceptionDate: data.exceptionDate,
                exceptionType: data.exceptionType ?? (data.isClosed ? "HOLIDAY" : "CUSTOM"),
                name: data.reason,
                isClosed: data.isClosed,
                customHours,
                isActive: true,
                isApproved: true,
                createdBy: data.createdBy,
                requestedBy: data.createdBy,
                approvedBy: data.createdBy,
                approvedAt: new Date(),
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
    // Scoped to the tenant and store, so an exception uuid from another
    // store can't be deactivated. Returns false if nothing matched.
    static async removeException(tenantUuid: string, storeUuid: string, exceptionUuid: string) {
        const result = await prisma.storeHourException.updateMany({
            where: { uuid: exceptionUuid, storeUuid, tenantUuid },
            data:  { isActive: false },
        });
        return result.count > 0;
    }
}