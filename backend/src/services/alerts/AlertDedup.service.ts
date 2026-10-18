import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"

// How long an alert for a condition covers it: a condition that persists
// (an order still stuck, a product still low) is re-alerted at most once per
// window
export const ALERT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export class AlertDedupService {
    // Creates the alert unless the tenant already has one with the same
    // groupKey (e.g. "ORDER_STUCK:<orderUuid>") raised within the window, in
    // any status: a resolved alert still counts, so resolving one doesn't
    // bring it straight back on the next run. A duplicate bumps the existing
    // alert's duplicateCount instead.
    //
    // Returns the new alert, or null for a duplicate. Check-then-create isn't
    // atomic; the alert jobs run under a job lock, so one run at a time.
    static async createOnce(
        data: Prisma.AdminAlertUncheckedCreateInput & { groupKey: string },
        windowMs = ALERT_DEDUP_WINDOW_MS
    ) {
        const existing = await prisma.adminAlert.findFirst({
            where: {
                tenantUuid: data.tenantUuid,
                groupKey: data.groupKey,
                createdAt: { gte: new Date(Date.now() - windowMs) },
            },
            orderBy: { createdAt: "desc" },
            select: { uuid: true },
        });

        if (existing) {
            await prisma.adminAlert.update({
                where: { uuid: existing.uuid },
                data: { duplicateCount: { increment: 1 } },
            });
            return null;
        }

        return prisma.adminAlert.create({ data });
    }
}
