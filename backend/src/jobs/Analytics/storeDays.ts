import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import prisma from "../../config/prisma.ts"
import { DailyReconciliationService } from "../../services/payment/DailyReconciliation.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

// Local hour at which the nightly metrics jobs compute a store's past days.
// Clear of the 02:00/03:00 DST jumps, and late card settlements and offline
// order syncs have landed by then.
export const METRICS_LOCAL_HOUR = 4;

// Local days recomputed per run: yesterday, and the day before in case a
// run was missed. Recomputing a day replaces its row, so it is harmless.
export const METRICS_DAYS = 2;

export type StoreDay = {
    storeUuid: string;
    tenantUuid: string;
    timezone: string;
    localDate: string; // YYYY-MM-DD in the store's timezone
    start: Date;       // [start, end) as UTC instants
    end: Date;
    dateKey: Date;     // the metrics rows' date: localDate at 00:00 UTC
};

// The store-local days due at `now`. The metrics jobs run hourly; a store is
// due during the hour its local clock reads METRICS_LOCAL_HOUR, with its last
// METRICS_DAYS complete local calendar days, most recent first. So each store
// is computed once a day, at about the same time where it is, whatever the
// server's timezone. opts.localDate computes that one day for every store
// instead, whatever the hour (backfill).
export async function storeDaysDue(
    now: Date,
    opts: { storeUuids?: string[]; localDate?: string } = {}
): Promise<StoreDay[]> {
    // Stores that are open, or were recently (a store shut down today still
    // had yesterday's orders)
    const recent = dayjs(now).subtract(3, "day").toDate();
    const stores = await prisma.store.findMany({
        where: {
            ...(opts.storeUuids && { uuid: { in: opts.storeUuids } }),
            OR: [
                { status: "ACTIVE" },
                { orders: { some: { createdAt: { gte: recent } } } },
            ],
        },
        select: { uuid: true, tenantUuid: true, timezone: true },
    });

    const due: StoreDay[] = [];
    for (const store of stores) {
        const tz = DailyReconciliationService.safeTimezone(store.timezone);
        let localDates: string[];
        if (opts.localDate) {
            localDates = [opts.localDate];
        } else {
            if (dayjs(now).tz(tz).hour() !== METRICS_LOCAL_HOUR) continue;
            localDates = [];
            for (let back = 1; back <= METRICS_DAYS; back++) {
                localDates.push(dayjs(now).tz(tz).subtract(back, "day").format("YYYY-MM-DD"));
            }
        }
        for (const localDate of localDates) {
            const { start, end, dateKey } = DailyReconciliationService.localDayWindow(tz, localDate);
            due.push({ storeUuid: store.uuid, tenantUuid: store.tenantUuid, timezone: tz, localDate, start, end, dateKey });
        }
    }
    return due;
}

// Average minutes from order creation to ready, over the store's orders
// created in [start, end) that have been marked ready. 0 when there are none.
// Computed in the database: Prisma's aggregate can't average a difference.
// Bounds are passed as UTC wall time cast to timestamp, matching the
// zone-less TIMESTAMP(3) columns whatever the session's TimeZone is.
export async function avgPrepMinutes(storeUuid: string, start: Date, end: Date): Promise<number> {
    const [row] = await prisma.$queryRaw<Array<{ avgMinutes: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM ("actualReadyAt" - "createdAt")))::float8 / 60 AS "avgMinutes"
        FROM "Order"
        WHERE "storeUuid" = ${storeUuid}
          AND "createdAt" >= ${start.toISOString()}::timestamp
          AND "createdAt" < ${end.toISOString()}::timestamp
          AND "actualReadyAt" IS NOT NULL
    `;
    return row?.avgMinutes ?? 0;
}
