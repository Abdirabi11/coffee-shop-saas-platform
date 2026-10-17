import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { DailyReconciliationService } from "../../services/payment/DailyReconciliation.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

// Local hour from which a store's previous day is reconciled: late card
// settlements and offline order syncs have landed by then
const RECONCILE_FROM_LOCAL_HOUR = 2;

// Runs hourly. Each store's previous calendar day, in the store's own
// timezone, is reconciled once local time passes 02:00, so every store gets
// its day reconciled at about 02:00 where it is, whatever the server's zone.
// A day already reconciled is skipped (re-run one by hand with
// DailyReconciliationService.reconcileStoreDay).
export class DailyReconciliationJob {
    static cronSchedule = "5 * * * *";

    // storeUuids narrows the run to those stores (catch-up for a few stores)
    static async run(now: Date = new Date(), opts: { storeUuids?: string[] } = {}) {
        // Stores that are open, or were recently (a store shut down today
        // still had yesterday's sales)
        const recent = dayjs(now).subtract(3, "day").toDate();
        const stores = await prisma.store.findMany({
            where: {
                ...(opts.storeUuids && { uuid: { in: opts.storeUuids } }),
                OR: [
                    { status: "ACTIVE" },
                    { payments: { some: { createdAt: { gte: recent } } } },
                ],
            },
            select: { uuid: true, timezone: true },
        });

        let reconciled = 0;
        let withVariance = 0;
        let skipped = 0;
        let failed = 0;

        for (const store of stores) {
            try {
                const tz = DailyReconciliationService.safeTimezone(store.timezone);
                if (dayjs(now).tz(tz).hour() < RECONCILE_FROM_LOCAL_HOUR) {
                    skipped++;
                    continue;
                }
                const localDate = DailyReconciliationService.previousLocalDate(tz, now);
                const { dateKey } = DailyReconciliationService.localDayWindow(tz, localDate);
                const done = await prisma.dailyReconciliation.findUnique({
                    where: { storeUuid_date: { storeUuid: store.uuid, date: dateKey } },
                    select: { uuid: true },
                });
                if (done) {
                    skipped++;
                    continue;
                }

                const row = await DailyReconciliationService.reconcileStoreDay(store.uuid, localDate);
                reconciled++;
                if (row.hasVariance) withVariance++;
            } catch (error: any) {
                failed++;
                logWithContext("error", "[DailyReconciliation] Store failed", {
                    storeUuid: store.uuid,
                    error: error.message,
                });
            }
        }

        if (reconciled > 0 || failed > 0) {
            logWithContext("info", "[DailyReconciliation] Completed", {
                stores: stores.length,
                reconciled,
                withVariance,
                skipped,
                failed,
            });
        }

        return { reconciled, withVariance, skipped, failed };
    }
}
