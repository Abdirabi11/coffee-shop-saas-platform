import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import type { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { LedgerAccounts, LedgerService, moneyAccount, type LedgerLine } from "./ledger.service.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

// Payments that brought money in. REFUNDED belongs here too: the sale was
// collected, and its refund is counted (on the day it was paid back) as
// money out. Leaving it out would subtract a same-day refund twice.
const COLLECTED_STATUSES = ["PAID", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

// Variance under this (minor units) is rounding, not a problem
const VARIANCE_TOLERANCE = 100;

export const DAILY_RECONCILIATION_REF = "DAILY_RECONCILIATION";

export class DailyReconciliationService {

    // Falls back to UTC for a missing or unknown timezone name
    static safeTimezone(tz: string | null | undefined) {
        if (!tz) return "UTC";
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: tz });
            return tz;
        } catch {
            return "UTC";
        }
    }

    // The calendar day before `now`, in the timezone, as YYYY-MM-DD
    static previousLocalDate(tz: string, now: Date = new Date()) {
        return dayjs(now).tz(tz).subtract(1, "day").format("YYYY-MM-DD");
    }

    // A store-local calendar day as UTC instants, [start, end). Both ends are
    // that zone's local midnights, so a DST day is 23 or 25 hours long.
    static localDayWindow(tz: string, localDate: string) {
        const next = dayjs.utc(localDate).add(1, "day").format("YYYY-MM-DD");
        return {
            start: dayjs.tz(localDate, tz).toDate(),
            end: dayjs.tz(next, tz).toDate(),
            // The row's date key: the calendar day itself, zone-free
            dateKey: new Date(`${localDate}T00:00:00.000Z`),
        };
    }

    // Reconciles one store's local calendar day (YYYY-MM-DD in the store's
    // timezone):
    //
    //   gross    every payment collected that day (paidAt, or processedAt
    //            for cashier payments), by cash / card terminal / online
    //   expected the totals of those payments' orders: a payment for more or
    //            less than its order is variance
    //   refunds  money paid back that day, by the same split
    //   fees     provider fees known for the day's online payments
    //   net      gross - refunds - fees
    //
    // Also lists payments still held on a cancelled order (extraPayments)
    // and completed orders with nothing collected (missingPayments), and
    // the counted variance of drawers closed that day (cashVariance).
    //
    // Re-running a day recomputes it and posts only the change to the
    // ledger. A row a manager has RESOLVED keeps its status.
    static async reconcileStoreDay(storeUuid: string, localDate: string, reconciledBy = "SYSTEM") {
        const store = await prisma.store.findUniqueOrThrow({
            where: { uuid: storeUuid },
            select: { uuid: true, tenantUuid: true, timezone: true },
        });
        const tz = this.safeTimezone(store.timezone);
        const { start, end, dateKey } = this.localDayWindow(tz, localDate);
        const window = { gte: start, lt: end };

        const payments = await prisma.payment.findMany({
            where: {
                storeUuid,
                status: { in: [...COLLECTED_STATUSES] },
                OR: [{ paidAt: window }, { paidAt: null, processedAt: window }],
            },
            select: {
                uuid: true, amount: true, currency: true, status: true, paymentFlow: true, paymentMethod: true, provider: true,
                order: { select: { uuid: true, status: true, totalAmount: true } },
                settlements: { select: { providerFee: true } },
            },
        });
        const refunds = await prisma.refund.findMany({
            where: { storeUuid, status: "COMPLETED", processedAt: window },
            select: { amount: true, currency: true, provider: true },
        });
        const drawerVariance = await prisma.cashDrawer.aggregate({
            where: { storeUuid, closedAt: window },
            _sum: { variance: true },
        });

        // Money in, per account
        const methodOf = (p: (typeof payments)[number]) =>
            p.paymentFlow === "CASHIER" ? p.paymentMethod : (p.provider ?? p.paymentMethod);
        let cash = 0, card = 0, online = 0, fees = 0, expected = 0;
        const extraPayments: string[] = [];
        for (const p of payments) {
            const method = methodOf(p);
            if (method === "CASH") cash += p.amount;
            else if (method === "CARD_TERMINAL") card += p.amount;
            else online += p.amount;
            fees += p.settlements?.providerFee ?? 0;
            expected += p.order.totalAmount;
        }
        const gross = cash + card + online;

        // Money out
        let cashRefunds = 0, cardRefunds = 0, onlineRefunds = 0;
        for (const r of refunds) {
            if (r.provider === "CASH") cashRefunds += r.amount;
            else if (r.provider === "CARD_TERMINAL") cardRefunds += r.amount;
            else onlineRefunds += r.amount;
        }
        const refundsTotal = cashRefunds + cardRefunds + onlineRefunds;
        const net = gross - refundsTotal - fees;

        // Cancelled orders whose money hasn't (all) gone back
        const cancelled = payments.filter((p) => p.order.status === "CANCELLED" && p.status !== "REFUNDED");
        if (cancelled.length > 0) {
            const refundedByPayment = await prisma.refund.groupBy({
                by: ["paymentUuid"],
                where: { paymentUuid: { in: cancelled.map((p) => p.uuid) }, status: "COMPLETED" },
                _sum: { amount: true },
            });
            const refunded = new Map(refundedByPayment.map((r) => [r.paymentUuid, r._sum.amount ?? 0]));
            for (const p of cancelled) {
                if ((refunded.get(p.uuid) ?? 0) < p.amount) extraPayments.push(p.uuid);
            }
        }

        // Orders served that day without a collected payment
        const unpaidOrders = await prisma.order.findMany({
            where: {
                storeUuid,
                status: "COMPLETED",
                createdAt: window,
                payments: { none: { status: { in: [...COLLECTED_STATUSES] } } },
            },
            select: { uuid: true },
        });
        const missingPayments = unpaidOrders.map((o) => o.uuid);

        const totalVariance = gross - expected;
        const cashVariance = drawerVariance._sum.variance ?? 0;
        const hasVariance =
            Math.abs(totalVariance) > VARIANCE_TOLERANCE ||
            Math.abs(cashVariance) > VARIANCE_TOLERANCE ||
            extraPayments.length > 0 ||
            missingPayments.length > 0;

        const currency = payments[0]?.currency ?? refunds[0]?.currency ?? "USD";
        const figures = {
            timezone: tz,
            periodStart: start,
            periodEnd: end,
            ordersCount: payments.length,
            ordersTotal: expected,
            cashDeclared: cash,
            cardDeclared: card,
            onlineDeclared: online,
            totalDeclared: gross,
            grossCollected: gross,
            cashRefunds,
            cardRefunds,
            onlineRefunds,
            refundsTotal,
            providerFees: fees,
            netCollected: net,
            cashVariance,
            totalVariance,
            variancePercent: expected > 0 ? Math.round((totalVariance / expected) * 10_000) / 100 : 0,
            hasVariance,
            requiresReview: hasVariance,
            missingPayments,
            extraPayments,
            reconciledBy,
        };

        // The day's postings: sales into each account, refunds out of it.
        // Fees post when the provider pays out (SettlementService.markSettled),
        // where the real amount is known.
        const lines: LedgerLine[] = [];
        const add = (type: LedgerLine["type"], debitAccount: string, creditAccount: string, amount: number, description: string) => {
            if (amount > 0) lines.push({ type, debitAccount, creditAccount, amount, currency, description });
        };
        const grossByAccount = new Map<string, number>();
        for (const p of payments) {
            const account = moneyAccount(methodOf(p));
            grossByAccount.set(account, (grossByAccount.get(account) ?? 0) + p.amount);
        }
        for (const [account, amount] of grossByAccount) add("PAYMENT", account, LedgerAccounts.SALES, amount, `Sales ${localDate}`);
        const refundsByAccount = new Map<string, number>();
        for (const r of refunds) {
            const account = moneyAccount(r.provider);
            refundsByAccount.set(account, (refundsByAccount.get(account) ?? 0) + r.amount);
        }
        for (const [account, amount] of refundsByAccount) add("REFUND", LedgerAccounts.SALES_REFUNDS, account, amount, `Refunds ${localDate}`);

        const row = await prisma.$transaction(async (tx) => {
            // One reconciliation of a store-day at a time
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-reconciliation:${storeUuid}:${localDate}`}))`;

            const existing = await tx.dailyReconciliation.findUnique({
                where: { storeUuid_date: { storeUuid, date: dateKey } },
                select: { status: true },
            });
            const status = existing?.status === "RESOLVED"
                ? "RESOLVED"
                : hasVariance ? "NEEDS_REVIEW" : "RECONCILED";

            const row = await tx.dailyReconciliation.upsert({
                where: { storeUuid_date: { storeUuid, date: dateKey } },
                update: { ...figures, status },
                create: { ...figures, status, storeUuid, tenantUuid: store.tenantUuid, date: dateKey },
            });

            await LedgerService.syncDocument(tx as Prisma.TransactionClient, {
                tenantUuid: store.tenantUuid,
                storeUuid,
                refType: DAILY_RECONCILIATION_REF,
                refUuid: row.uuid,
                createdBy: reconciledBy,
            }, lines);

            return row;
        });

        logWithContext(hasVariance ? "warn" : "info", "[DailyReconciliation] Store reconciled", {
            storeUuid,
            date: localDate,
            timezone: tz,
            gross,
            refundsTotal,
            fees,
            net,
            totalVariance,
            cashVariance,
            extraPayments: extraPayments.length,
            missingPayments: missingPayments.length,
        });

        return row;
    }
}
