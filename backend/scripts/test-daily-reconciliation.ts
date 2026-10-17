// LOCAL DAILY RECONCILIATION CHECKS (Phase 44)
// Builds a simulated store day in New York (UTC-4 in October) with sales
// on both sides of local and UTC midnight, then checks:
//
//   1. Day boundaries - the store's previous local calendar day, picked once
//      it is past 02:00 there; a sale at 23:50 local (03:50 UTC, the next
//      UTC day) belongs to the day, one at 23:30 the day before (03:30 UTC,
//      the same UTC day) does not.
//   2. The math - gross over PAID / COMPLETED / PARTIALLY_REFUNDED /
//      REFUNDED payments, refunds by method, provider fees from the
//      settlement, net = gross - refunds - fees; no variance on a clean day.
//   3. Findings - money kept on a cancelled order, a payment that doesn't
//      match its order.
//   4. Ledger - the day posts balanced double entries; a re-run with no
//      change posts nothing, a changed day posts only adjustments.
//   5. Settlements - a confirmed provider payment records one pending
//      settlement; the payout posts fee and net to the ledger once.
//   6. Provider reconciliation - provider net is compared with
//      gross - refunds - provider fees (fees aren't variance), charges that
//      land just past midnight are matched, other tenants' are ignored, a
//      missing charge is reported.
//
//   npx tsx scripts/test-daily-reconciliation.ts
//
// Each run creates its own tenant and stores. Exits non-zero if any check
// fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { DailyReconciliationService } = await import("../src/services/payment/DailyReconciliation.service.ts");
const { DailyReconciliationJob } = await import("../src/jobs/Payment/DailyReconciliation.job.ts");
const { PaymentReconciliationService } = await import("../src/services/payment/PaymentReconciliation.service.ts");
const { SettlementService } = await import("../src/services/payment/Settlement.service.ts");
const { PaymentService } = await import("../src/services/payment/payment.service.ts");
const { LedgerService } = await import("../src/services/payment/ledger.service.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1557${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

// The simulated day: Thursday 2026-10-15 in New York (EDT, UTC-4)
const DAY = "2026-10-15";
const ny = (local: string) => new Date(`${local}-04:00`);

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Recon" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Recon ${runId}`, slug: `recon-${runId}`, email: `recon-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const otherOwner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Other", lastName: "Recon" } });
    const other = await prisma.tenant.create({
        data: { name: `Recon other ${runId}`, slug: `recon-other-${runId}`, email: `recon-other-${runId}@example.test`, ownerUuid: otherOwner.uuid },
    });
    const store = (tenantUuid: string, label: string, timezone: string) => prisma.store.create({
        data: { tenantUuid, name: `Recon ${label}`, slug: `recon-${label.toLowerCase()}-${runId}`, city: "New York", timezone },
    });
    const member = await prisma.tenantUser.create({ data: { tenantUuid: tenant.uuid, userUuid: owner.uuid, slug: `recon-owner-${runId}` } });
    const otherMember = await prisma.tenantUser.create({ data: { tenantUuid: other.uuid, userUuid: otherOwner.uuid, slug: `recon-other-${runId}` } });
    return {
        tenant, other, member, otherMember,
        nyStore: await store(tenant.uuid, "NY", "America/New_York"),
        otherStore: await store(other.uuid, "Other", "UTC"),
    };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

// An order and its payment, with the collection time set directly
async function sale(ctx: Ctx, opts: {
    storeUuid?: string; tenantUuid?: string; amount: number; orderTotal?: number; at: Date;
    method: "CASH" | "CARD_TERMINAL" | "STRIPE"; status: string; orderStatus?: string; providerRef?: string;
}) {
    const tenantUuid = opts.tenantUuid ?? ctx.tenant.uuid;
    const storeUuid = opts.storeUuid ?? ctx.nyStore.uuid;
    const order = await prisma.order.create({
        data: {
            tenantUuid, storeUuid, tenantUserUuid: tenantUuid === ctx.tenant.uuid ? ctx.member.uuid : ctx.otherMember.uuid,
            orderNumber: `RC-${runId}-${seq++}`, subtotal: opts.orderTotal ?? opts.amount, totalAmount: opts.orderTotal ?? opts.amount,
            menuVersion: 1, pricingSnapshot: {}, status: (opts.orderStatus ?? "COMPLETED") as any, createdAt: new Date(opts.at.getTime() - 5 * 60_000),
        },
    });
    const online = opts.method === "STRIPE";
    const payment = await prisma.payment.create({
        data: {
            tenantUuid, storeUuid, orderUuid: order.uuid, amount: opts.amount, currency: "USD", subtotal: opts.amount, tax: 0,
            paymentFlow: online ? "PROVIDER" : "CASHIER", paymentMethod: online ? "STRIPE" : opts.method,
            provider: online ? "STRIPE" : null, providerRef: opts.providerRef ?? null, status: opts.status as any, snapshot: {}, orderSnapshot: {}, pricingRules: {},
            ...(online ? { paidAt: opts.at } : { processedAt: opts.at }),
        },
    });
    return { order, payment };
}

async function refund(ctx: Ctx, p: { uuid: string; orderUuid: string; storeUuid: string }, amount: number, provider: string, at: Date) {
    return prisma.refund.create({
        data: {
            tenantUuid: ctx.tenant.uuid, paymentUuid: p.uuid, orderUuid: p.orderUuid, storeUuid: p.storeUuid, amount, currency: "USD",
            type: "PARTIAL", status: "COMPLETED", reason: "test", provider, snapshot: {}, processedAt: at,
        },
    });
}

const ledgerOf = (refUuid: string) => prisma.ledgerEntry.findMany({ where: { refUuid }, orderBy: { createdAt: "asc" } });

async function main() {
    const ctx = await setup();
    console.log(`Run ${runId}`);

    // ── 1. Day boundaries ──
    console.log("\n1. Day boundaries (America/New_York)");
    const w = DailyReconciliationService.localDayWindow("America/New_York", DAY);
    check("window starts at local midnight", w.start.toISOString(), "2026-10-15T04:00:00.000Z");
    check("  ...ends at the next local midnight", w.end.toISOString(), "2026-10-16T04:00:00.000Z");
    check("previous local day at 02:05 NY (06:05 UTC)", DailyReconciliationService.previousLocalDate("America/New_York", new Date("2026-10-16T06:05:00Z")), DAY);
    check("previous local day at 02:05 Tokyo", DailyReconciliationService.previousLocalDate("Asia/Tokyo", new Date("2026-10-15T17:05:00Z")), DAY);
    const dst = DailyReconciliationService.localDayWindow("America/New_York", "2026-11-01");
    check("DST day is 25 hours", (dst.end.getTime() - dst.start.getTime()) / 3_600_000, 25);
    check("unknown timezone falls back to UTC", DailyReconciliationService.safeTimezone("Mars/Olympus"), "UTC");

    // The day's sales
    const cashLate = await sale(ctx, { amount: 1000, at: ny(`${DAY}T23:50:00`), method: "CASH", status: "COMPLETED" });       // 03:50Z on the 16th
    const cashPrevDay = await sale(ctx, { amount: 400, at: ny("2026-10-14T23:30:00"), method: "CASH", status: "COMPLETED" }); // 03:30Z on the 15th
    const cashNextDay = await sale(ctx, { amount: 700, at: ny("2026-10-16T00:10:00"), method: "CASH", status: "COMPLETED" }); // after local midnight
    const card = await sale(ctx, { amount: 2000, at: ny(`${DAY}T12:00:00`), method: "CARD_TERMINAL", status: "PARTIALLY_REFUNDED" });
    await refund(ctx, card.payment, 500, "CARD_TERMINAL", ny(`${DAY}T15:00:00`));
    const onlineRefunded = await sale(ctx, { amount: 1500, at: ny(`${DAY}T10:00:00`), method: "STRIPE", status: "REFUNDED", providerRef: `pi_B_${runId}` });
    await refund(ctx, onlineRefunded.payment, 1500, "STRIPE", ny(`${DAY}T11:00:00`));

    // An online sale confirmed through the real path: records its settlement
    const onlineOrder = await prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.nyStore.uuid, tenantUserUuid: ctx.member.uuid, orderNumber: `RC-${runId}-${seq++}`,
            subtotal: 3000, totalAmount: 3000, menuVersion: 1, pricingSnapshot: {}, status: "PENDING", createdAt: ny(`${DAY}T08:55:00`),
        },
    });
    const pending = await prisma.payment.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.nyStore.uuid, orderUuid: onlineOrder.uuid, amount: 3000, currency: "USD", subtotal: 3000, tax: 0,
            paymentFlow: "PROVIDER", paymentMethod: "STRIPE", provider: "STRIPE", providerRef: `pi_A_${runId}`, status: "PENDING", snapshot: {}, orderSnapshot: {}, pricingRules: {},
        },
    });

    // ── 5. Settlements (before the day is reconciled, so the fee is known) ──
    console.log("\n5. Settlements");
    const confirm = () => PaymentService.confirmFromProviderEvent({
        paymentUuid: pending.uuid, providerRef: `pi_A_${runId}`, amountReceived: 3000, currency: "usd", snapshot: {}, source: "WEBHOOK",
    });
    await confirm();
    await confirm();
    const settlements = await prisma.settlement.findMany({ where: { paymentUuid: pending.uuid } });
    check("confirmed provider payment: one pending settlement", `${settlements.length} ${settlements[0]?.status} ${settlements[0]?.grossAmount}`, "1 PENDING 3000");
    await prisma.payment.update({ where: { uuid: pending.uuid }, data: { paidAt: ny(`${DAY}T09:00:00`) } });
    await prisma.order.update({ where: { uuid: onlineOrder.uuid }, data: { status: "COMPLETED" } });
    const payout = { providerRef: `pi_A_${runId}`, providerPayoutId: `po_${runId}`, settledAt: new Date(), netAmount: 2883, fee: 117 };
    await Promise.all([SettlementService.markSettled(payout), SettlementService.markSettled(payout)]);
    const settled = await prisma.settlement.findUniqueOrThrow({ where: { paymentUuid: pending.uuid } });
    check("payout marks it settled with the real fee", `${settled.status} ${settled.providerFee} ${settled.netAmount}`, "SETTLED 117 2883");
    const settlementLedger = await ledgerOf(settled.uuid);
    check("  ...ledger: fee and payout, once", settlementLedger.map((e) => `${e.type}:${e.debitAccount}>${e.creditAccount}:${e.amount}`).sort().join(" "),
        "FEE:provider_fees>provider_clearing:STRIPE:117 PAYOUT:bank>provider_clearing:STRIPE:2883");

    // ── 2. The math ──
    console.log("\n2. The math");
    // Job at 01:30 NY: too early, the day isn't reconciled yet
    const early = await DailyReconciliationJob.run(new Date("2026-10-16T05:30:00Z"), { storeUuids: [ctx.nyStore.uuid] });
    check("job before 02:00 local skips the store", `${early.reconciled} ${early.skipped}`, "0 1");
    const job = await DailyReconciliationJob.run(new Date("2026-10-16T06:05:00Z"), { storeUuids: [ctx.nyStore.uuid] });
    check("job at 02:05 local reconciles it", job.reconciled, 1);
    const again = await DailyReconciliationJob.run(new Date("2026-10-16T07:05:00Z"), { storeUuids: [ctx.nyStore.uuid] });
    check("  ...and not again an hour later", `${again.reconciled} ${again.skipped}`, "0 1");

    const row = await prisma.dailyReconciliation.findUniqueOrThrow({
        where: { storeUuid_date: { storeUuid: ctx.nyStore.uuid, date: new Date(`${DAY}T00:00:00Z`) } },
    });
    check("row is for the 15th, NY window", `${row.timezone} ${row.periodStart?.toISOString()}`, "America/New_York 2026-10-15T04:00:00.000Z");
    check("cash: 23:50 sale in, previous/next-day sales out", row.cashDeclared, 1000);
    check("card (partially refunded) counted gross", row.cardDeclared, 2000);
    check("online: paid + same-day refunded", row.onlineDeclared, 4500);
    check("gross", row.grossCollected, 7500);
    check("refunds by method (cash/card/online)", `${row.cashRefunds}/${row.cardRefunds}/${row.onlineRefunds}`, "0/500/1500");
    check("provider fees", row.providerFees, 117);
    check("net = 7500 - 2000 - 117", row.netCollected, 5383);
    check("no variance against order totals", `${row.totalVariance} ${row.status}`, "0 RECONCILED");

    // ── 4. Ledger ──
    console.log("\n4. Ledger");
    let entries = await ledgerOf(row.uuid);
    check("day posted", entries.map((e) => `${e.debitAccount}>${e.creditAccount}:${e.amount}`).sort().join(" "),
        "card_terminal>sales:2000 cash_drawer>sales:1000 provider_clearing:STRIPE>sales:4500 sales_refunds>card_terminal:500 sales_refunds>provider_clearing:STRIPE:1500");
    const dayBalance = (account: string) => LedgerService.balance({ tenantUuid: ctx.tenant.uuid, storeUuid: ctx.nyStore.uuid, account });
    check("sales account: 7500 credit", await dayBalance("sales"), -7500);
    check("STRIPE clearing: 4500 - 1500 refunded - 117 fee - 2883 paid out", await dayBalance("provider_clearing:STRIPE"), 0);
    await DailyReconciliationService.reconcileStoreDay(ctx.nyStore.uuid, DAY);
    check("re-run with no change posts nothing", (await ledgerOf(row.uuid)).length, entries.length);

    // ── 3. Findings ──
    console.log("\n3. Findings");
    const kept = await sale(ctx, { amount: 600, at: ny(`${DAY}T18:00:00`), method: "CASH", status: "COMPLETED", orderStatus: "CANCELLED" });
    const short = await sale(ctx, { amount: 800, orderTotal: 1000, at: ny(`${DAY}T19:00:00`), method: "CASH", status: "COMPLETED" });
    const rerun = await DailyReconciliationService.reconcileStoreDay(ctx.nyStore.uuid, DAY);
    check("cancelled order still holding its money", rerun.extraPayments.join(), kept.payment.uuid);
    check("payment 200 short of its order", rerun.totalVariance, -200);
    check("  ...needs review", rerun.status, "NEEDS_REVIEW");
    entries = await ledgerOf(row.uuid);
    const adj = entries.filter((e) => e.type === "ADJUSTMENT");
    check("re-run posts one adjustment for the 1400 more cash", adj.map((e) => `${e.debitAccount}>${e.creditAccount}:${e.amount}`).join(), "cash_drawer>sales:1400");

    // The cancelled order is refunded in cash the same day
    await refund(ctx, kept.payment, 600, "CASH", ny(`${DAY}T18:30:00`));
    await prisma.payment.update({ where: { uuid: short.payment.uuid }, data: { amount: 1000 } }); // corrected
    const fixed = await DailyReconciliationService.reconcileStoreDay(ctx.nyStore.uuid, DAY);
    check("after the refund and the correction: clean", `${fixed.extraPayments.length} ${fixed.totalVariance} ${fixed.status}`, "0 0 RECONCILED");
    check("  ...net = 9100 - 2600 - 117", fixed.netCollected, 6383);
    const cashBalance = await dayBalance("cash_drawer");
    check("ledger cash: 1000 + 600 + 1000 sold - 600 refunded", cashBalance, 2000);
    check("ledger sales still mirror gross (7500 + 600 + 1000)", await dayBalance("sales"), -9100);
    const allDayEntries = await ledgerOf(row.uuid);
    const debits = allDayEntries.reduce((s, e) => s + e.amount, 0);
    check("every entry is a balanced pair (no negative or zero amounts)", allDayEntries.every((e) => e.amount > 0 && e.debitAccount !== e.creditAccount), true);
    console.log(`    ${allDayEntries.length} ledger entries, ${debits} posted`);

    // A day a manager resolved keeps its status on re-run
    await prisma.dailyReconciliation.update({ where: { uuid: row.uuid }, data: { status: "RESOLVED" } });
    check("resolved day keeps RESOLVED on re-run", (await DailyReconciliationService.reconcileStoreDay(ctx.nyStore.uuid, DAY)).status, "RESOLVED");
    void cashPrevDay; void cashNextDay;

    // ── 6. Provider reconciliation ──
    console.log("\n6. Provider reconciliation");
    const nearMidnight = await sale(ctx, { amount: 800, at: ny(`${DAY}T23:59:58`), method: "STRIPE", status: "PAID", providerRef: `pi_C_${runId}` });
    await sale(ctx, { tenantUuid: ctx.other.uuid, storeUuid: ctx.otherStore.uuid, amount: 9900, at: ny(`${DAY}T12:00:00`), method: "STRIPE", status: "PAID", providerRef: `pi_X_${runId}` });
    const txn = (id: string, kind: "payment" | "refund", ref: string, amount: number, fee: number, at: Date) =>
        ({ id, kind, paymentRef: ref, amount, fee, net: kind === "payment" ? amount - fee : -amount - fee, createdAt: at });
    const report = [
        txn("txn_1", "payment", `pi_A_${runId}`, 3000, 117, ny(`${DAY}T09:00:01`)),
        txn("txn_2", "payment", `pi_B_${runId}`, 1500, 74, ny(`${DAY}T10:00:01`)),
        txn("txn_3", "refund", `pi_B_${runId}`, 1500, 0, ny(`${DAY}T11:00:01`)),
        txn("txn_4", "payment", `pi_C_${runId}`, 800, 53, ny("2026-10-16T00:00:03")), // just past midnight at Stripe
        txn("txn_5", "payment", `pi_X_${runId}`, 9900, 317, ny(`${DAY}T12:00:01`)),   // another tenant's
    ];
    const recon = (transactions: typeof report) => PaymentReconciliationService.reconcile({
        tenantUuid: ctx.tenant.uuid, provider: "stripe", periodStart: w.start, periodEnd: w.end, transactions,
    });
    const clean = await recon(report);
    check("fees 117 + 74 + 53 separated out", clean.providerFees, 244);
    check("net matches: 5300 - 1500 - 244 == provider net", `${clean.netVariance} ${clean.paymentVariance} ${clean.refundVariance}`, "0 0 0");
    check("  ...charge just past midnight matched, other tenant ignored", `${clean.missingInProvider.length} ${clean.missingInOurSystem.length} ${clean.hasDiscrepancy}`, "0 0 false");
    const stored = await prisma.paymentReconciliation.findUniqueOrThrow({
        where: { tenantUuid_provider_periodStart: { tenantUuid: ctx.tenant.uuid, provider: "STRIPE", periodStart: w.start } },
    });
    check("  ...stored with fee and expected net", `${stored.providerFeeTotal} ${stored.expectedNetTotal} ${stored.providerNetTotal} ${stored.status}`, "244 3556 3556 RECONCILED");

    const missing = await recon(report.filter((t) => t.id !== "txn_4"));
    check("charge missing at the provider is reported", missing.missingInProvider.join(), nearMidnight.payment.uuid);
    check("  ...as a discrepancy (re-run replaces the row)", `${missing.hasDiscrepancy} ${await prisma.paymentReconciliation.count({ where: { tenantUuid: ctx.tenant.uuid } })}`, "true 1");
}

let exitCode = 0;
try {
    await main();
    console.log(failures === 0 ? "\nAll reconciliation checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nReconciliation test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
