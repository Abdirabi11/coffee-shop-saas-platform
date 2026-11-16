import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MenuCacheService } from "./menuCache.service.ts";

// Availability schedules and category order, as MenuService reads them:
//   availableDays   store-local weekdays ("MONDAY"...); empty = every day
//   timeSlots       store-local [{ start: "HH:mm", end: "HH:mm" }]; null = all day
//   availableFrom / availableUntil   absolute instants bounding the whole schedule
//   Category.order  menu order, ascending
// Day and time rules use the store's timezone (Store.timezone).
export interface MenuSchedule {
    availableDays: string[];
    timeSlots: Array<{ start: string; end: string }> | null;
    availableFrom: Date | null;
    availableUntil: Date | null;
}

const scheduleFields = {
    availableDays: true,
    timeSlots: true,
    availableFrom: true,
    availableUntil: true,
} as const;

function toData(schedule: MenuSchedule) {
    return {
        availableDays: schedule.availableDays,
        // Stored as SQL NULL, never [], so "no time restriction" is unambiguous
        timeSlots: schedule.timeSlots && schedule.timeSlots.length > 0 ? schedule.timeSlots : Prisma.DbNull,
        availableFrom: schedule.availableFrom,
        availableUntil: schedule.availableUntil,
    };
}

export class MenuScheduleService {
    // Replaces the category's schedule (send an empty one to clear it)
    static async setCategorySchedule(input: {
        tenantUuid: string;
        categoryUuid: string;
        schedule: MenuSchedule;
        triggeredBy: string;
    }) {
        const category = await prisma.category.findFirst({
            where: { uuid: input.categoryUuid, tenantUuid: input.tenantUuid, deletedAt: null },
            select: { uuid: true, storeUuid: true },
        });
        if (!category) throw new Error("CATEGORY_NOT_FOUND");

        const updated = await prisma.category.update({
            where: { uuid: category.uuid },
            data: toData(input.schedule),
            select: { uuid: true, name: true, ...scheduleFields },
        });

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: category.storeUuid,
            reason: "CATEGORY_SCHEDULE_UPDATED",
            triggeredBy: input.triggeredBy,
        });
        logWithContext("info", "[MenuSchedule] Category schedule set", { categoryUuid: category.uuid });
        return updated;
    }

    static async setProductSchedule(input: {
        tenantUuid: string;
        productUuid: string;
        schedule: MenuSchedule;
        triggeredBy: string;
    }) {
        const product = await prisma.product.findFirst({
            where: { uuid: input.productUuid, tenantUuid: input.tenantUuid, isDeleted: false },
            select: { uuid: true, storeUuid: true },
        });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const updated = await prisma.product.update({
            where: { uuid: product.uuid },
            data: toData(input.schedule),
            select: { uuid: true, name: true, ...scheduleFields },
        });

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: product.storeUuid,
            reason: "PRODUCT_SCHEDULE_UPDATED",
            triggeredBy: input.triggeredBy,
        });
        logWithContext("info", "[MenuSchedule] Product schedule set", { productUuid: product.uuid });
        return updated;
    }

    // Sets the menu order of a store's categories. categoryUuids must list
    // every (non-deleted) category of the store exactly once, in the new
    // order: a partial list would leave the others colliding with it.
    static async reorderCategories(input: {
        tenantUuid: string;
        storeUuid: string;
        categoryUuids: string[];
        triggeredBy: string;
    }) {
        const existing = await prisma.category.findMany({
            where: { tenantUuid: input.tenantUuid, storeUuid: input.storeUuid, deletedAt: null },
            select: { uuid: true },
        });
        const known = new Set(existing.map((c) => c.uuid));
        const given = new Set(input.categoryUuids);

        if (given.size !== input.categoryUuids.length) throw new Error("DUPLICATE_CATEGORY_IN_ORDER");
        const unknown = input.categoryUuids.filter((uuid) => !known.has(uuid));
        const missing = [...known].filter((uuid) => !given.has(uuid));
        if (unknown.length > 0 || missing.length > 0) {
            const error: any = new Error("CATEGORY_ORDER_MISMATCH");
            error.details = { unknown, missing };
            throw error;
        }

        await prisma.$transaction(
            input.categoryUuids.map((uuid, index) =>
                prisma.category.update({ where: { uuid }, data: { order: index } })
            )
        );

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            reason: "CATEGORIES_REORDERED",
            triggeredBy: input.triggeredBy,
        });
        logWithContext("info", "[MenuSchedule] Categories reordered", {
            storeUuid: input.storeUuid,
            count: input.categoryUuids.length,
        });

        return input.categoryUuids.map((uuid, index) => ({ uuid, order: index }));
    }
}
