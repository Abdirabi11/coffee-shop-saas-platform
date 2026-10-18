import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import {
    COLLECTED_STATUSES,
    DailyReconciliationService,
    collectedPaymentsWhere,
    completedRefundsWhere,
    paymentMethodOf,
    revenueChannel,
} from "../payment/DailyReconciliation.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

// Dashboard periods and revenue, per store, in each store's own timezone.
// Revenue is the daily reconciliation's (see collectedPaymentsWhere): money
// collected minus refunds paid back minus provider fees, timed by when it
// moved, not by when the order was placed.

export type Period = "today" | "week" | "month" | "quarter" | "year";

// One store's slice of a dashboard period, [gte, lt) as UTC instants
export type StoreWindow = { storeUuid: string; timezone: string; gte: Date; lt: Date };

type StoreTz = { uuid: string; timezone: string | null };

export type Revenue = { gross: number; refunds: number; providerFees: number; net: number; payments: number };

const PERIOD_STEP: Record<Period, [number, dayjs.ManipulateType]> = {
    today: [1, "day"],
    week: [1, "week"],
    month: [1, "month"],
    quarter: [3, "month"],
    year: [1, "year"],
};

// The local calendar date the period containing `now` starts on, and the one
// the period before it starts on. Date math on plain dates, so DST can't
// shift a boundary. "quarter" is the last three whole months plus this one.
function periodStartDates(period: Period, tz: string, now: Date) {
    const today = dayjs.utc(dayjs(now).tz(tz).format("YYYY-MM-DD"));
    const start =
        period === "today" ? today
        : period === "quarter" ? today.subtract(3, "month").startOf("month")
        : today.startOf(period);
    const [n, unit] = PERIOD_STEP[period];
    return { start: start.format("YYYY-MM-DD"), previous: start.subtract(n, unit).format("YYYY-MM-DD") };
}

// Each store's window for the period up to now, and for the same stretch of
// the period before (yesterday up to this time of day, last month up to the
// same day...), for "change since last period"
export function periodWindows(stores: StoreTz[], period: Period, now: Date = new Date()) {
    const current: StoreWindow[] = [];
    const previous: StoreWindow[] = [];
    for (const store of stores) {
        const tz = DailyReconciliationService.safeTimezone(store.timezone);
        const dates = periodStartDates(period, tz, now);
        const start = dayjs.tz(dates.start, tz).toDate();
        const prevStart = dayjs.tz(dates.previous, tz).toDate();
        const elapsed = now.getTime() - start.getTime();
        const prevEnd = new Date(Math.min(prevStart.getTime() + elapsed, start.getTime()));
        current.push({ storeUuid: store.uuid, timezone: tz, gte: start, lt: now });
        previous.push({ storeUuid: store.uuid, timezone: tz, gte: prevStart, lt: prevEnd });
    }
    return { current, previous };
}

// The same absolute range for every store (explicit dateFrom / dateTo)
export function fixedWindows(stores: StoreTz[], gte: Date, lt: Date): StoreWindow[] {
    return stores.map((s) => ({ storeUuid: s.uuid, timezone: DailyReconciliationService.safeTimezone(s.timezone), gte, lt }));
}

const range = (w: StoreWindow) => ({ gte: w.gte, lt: w.lt });

// Payment / refund / order filters over a set of store windows. No windows
// matches nothing (Prisma treats an empty OR as false).
export function collectedPaymentsIn(windows: StoreWindow[]): Prisma.PaymentWhereInput {
    return { OR: windows.map((w) => ({ storeUuid: w.storeUuid, ...collectedPaymentsWhere(range(w)) })) };
}

export function completedRefundsIn(windows: StoreWindow[]): Prisma.RefundWhereInput {
    return { OR: windows.map((w) => ({ storeUuid: w.storeUuid, ...completedRefundsWhere(range(w)) })) };
}

export function ordersCreatedIn(windows: StoreWindow[]): Prisma.OrderWhereInput {
    return { OR: windows.map((w) => ({ storeUuid: w.storeUuid, createdAt: range(w) })) };
}

// Payments that failed in the windows (failedAt, or createdAt when unset)
export function failedPaymentsIn(windows: StoreWindow[]): Prisma.PaymentWhereInput {
    return {
        status: "FAILED",
        OR: windows.map((w) => ({
            storeUuid: w.storeUuid,
            OR: [{ failedAt: range(w) }, { failedAt: null, createdAt: range(w) }],
        })),
    };
}

const revenueOf = (gross: number, refunds: number, providerFees: number, payments: number): Revenue =>
    ({ gross, refunds, providerFees, net: gross - refunds - providerFees, payments });

// Revenue over the windows, all stores together
export async function collectedRevenue(windows: StoreWindow[]): Promise<Revenue> {
    const paymentsWhere = collectedPaymentsIn(windows);
    const [payments, refunds, fees] = await Promise.all([
        prisma.payment.aggregate({ where: paymentsWhere, _sum: { amount: true }, _count: { _all: true } }),
        prisma.refund.aggregate({ where: completedRefundsIn(windows), _sum: { amount: true } }),
        prisma.settlement.aggregate({ where: { payment: paymentsWhere }, _sum: { providerFee: true } }),
    ]);
    return revenueOf(payments._sum.amount ?? 0, refunds._sum.amount ?? 0, fees._sum.providerFee ?? 0, payments._count._all);
}

// Revenue over the windows, per store
export async function collectedRevenueByStore(windows: StoreWindow[]): Promise<Map<string, Revenue>> {
    const paymentsWhere = collectedPaymentsIn(windows);
    const [payments, refunds, fees] = await Promise.all([
        prisma.payment.groupBy({ by: ["storeUuid"], where: paymentsWhere, _sum: { amount: true }, _count: { _all: true } }),
        prisma.refund.groupBy({ by: ["storeUuid"], where: completedRefundsIn(windows), _sum: { amount: true } }),
        prisma.settlement.groupBy({ by: ["storeUuid"], where: { payment: paymentsWhere }, _sum: { providerFee: true } }),
    ]);
    const paymentMap = new Map(payments.map((p) => [p.storeUuid, p]));
    const refundMap = new Map(refunds.map((r) => [r.storeUuid, r._sum.amount ?? 0]));
    const feeMap = new Map(fees.map((f) => [f.storeUuid, f._sum.providerFee ?? 0]));
    const byStore = new Map<string, Revenue>();
    for (const storeUuid of new Set([...paymentMap.keys(), ...refundMap.keys()])) {
        const p = paymentMap.get(storeUuid);
        byStore.set(storeUuid, revenueOf(p?._sum.amount ?? 0, refundMap.get(storeUuid) ?? 0, feeMap.get(storeUuid) ?? 0, p?._count._all ?? 0));
    }
    return byStore;
}

// Gross and refunds per reconciliation channel (cash, card terminal, online)
export async function revenueByChannel(windows: StoreWindow[]) {
    const [payments, refunds] = await Promise.all([
        prisma.payment.groupBy({
            by: ["paymentFlow", "paymentMethod", "provider"],
            where: collectedPaymentsIn(windows),
            _sum: { amount: true },
        }),
        prisma.refund.groupBy({ by: ["provider"], where: completedRefundsIn(windows), _sum: { amount: true } }),
    ]);
    const channels = {
        CASH: { gross: 0, refunds: 0 },
        CARD_TERMINAL: { gross: 0, refunds: 0 },
        ONLINE: { gross: 0, refunds: 0 },
    };
    for (const p of payments) channels[revenueChannel(paymentMethodOf(p))].gross += p._sum.amount ?? 0;
    for (const r of refunds) channels[revenueChannel(r.provider)].refunds += r._sum.amount ?? 0;
    return channels;
}

// Revenue per store-local calendar day (YYYY-MM-DD), each payment and refund
// on the day it happened where its store is. Grouped in the database. The
// filters are collectedPaymentsWhere / completedRefundsWhere in SQL:
// COALESCE(paidAt, processedAt) in the window is "paidAt in it, or no paidAt
// and processedAt in it". Timestamps are zone-less UTC (TIMESTAMP(3)), so
// bounds are passed as UTC wall time and converted with AT TIME ZONE.
export async function revenueByLocalDay(windows: StoreWindow[]): Promise<Map<string, Revenue>> {
    const days = new Map<string, Revenue>();
    if (windows.length === 0) return days;

    const storeWindows = Prisma.join(windows.map((w) =>
        Prisma.sql`(${w.storeUuid}, ${w.timezone}, ${w.gte.toISOString()}::timestamp, ${w.lt.toISOString()}::timestamp)`
    ));
    const collected = Prisma.join([...COLLECTED_STATUSES]);

    const [payments, refunds] = await Promise.all([
        prisma.$queryRaw<Array<{ day: string; gross: bigint; fees: bigint; payments: number }>>`
            WITH w("storeUuid", tz, "from", "to") AS (VALUES ${storeWindows})
            SELECT to_char((COALESCE(p."paidAt", p."processedAt") AT TIME ZONE 'UTC') AT TIME ZONE w.tz, 'YYYY-MM-DD') AS day,
                   SUM(p.amount)::bigint AS gross,
                   COALESCE(SUM(s."providerFee"), 0)::bigint AS fees,
                   COUNT(*)::int AS payments
            FROM "Payment" p
            JOIN w ON w."storeUuid" = p."storeUuid"
            LEFT JOIN "Settlement" s ON s."paymentUuid" = p.uuid
            WHERE p.status::text IN (${collected})
              AND COALESCE(p."paidAt", p."processedAt") >= w."from"
              AND COALESCE(p."paidAt", p."processedAt") < w."to"
            GROUP BY 1
        `,
        prisma.$queryRaw<Array<{ day: string; refunds: bigint }>>`
            WITH w("storeUuid", tz, "from", "to") AS (VALUES ${storeWindows})
            SELECT to_char((r."processedAt" AT TIME ZONE 'UTC') AT TIME ZONE w.tz, 'YYYY-MM-DD') AS day,
                   SUM(r.amount)::bigint AS refunds
            FROM "Refund" r
            JOIN w ON w."storeUuid" = r."storeUuid"
            WHERE r.status = 'COMPLETED'
              AND r."processedAt" >= w."from"
              AND r."processedAt" < w."to"
            GROUP BY 1
        `,
    ]);

    for (const p of payments) days.set(p.day, revenueOf(Number(p.gross), 0, Number(p.fees), p.payments));
    for (const r of refunds) {
        const d = days.get(r.day) ?? revenueOf(0, 0, 0, 0);
        days.set(r.day, revenueOf(d.gross, d.refunds + Number(r.refunds), d.providerFees, d.payments));
    }
    return days;
}
