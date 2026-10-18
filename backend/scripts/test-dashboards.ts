// LOCAL DASHBOARD CHECKS (Phase 47)
// Two stores in timezones where it is currently daytime, with today's sales
// (local today, not the server's), sales just before local midnight, a
// partial and a full refund, a provider fee, pending and failed payments.
// Then checks:
//
//   1. Periods - store-local today / week / month / year windows and the
//      matching stretch of the period before, across DST.
//   2. Revenue - the store and tenant dashboards report the daily
//      reconciliation's figures: gross over PAID / COMPLETED /
//      PARTIALLY_REFUNDED / REFUNDED payments, minus refunds, minus provider
//      fees, for each store's local day; per channel, per store and per
//      local day agree.
//   3. Caching - repeated reads are served from cache (the keys no longer
//      change every millisecond); order and payment events drop the right
//      dashboards and only those.
//
//   npx tsx scripts/test-dashboards.ts
//
// Each run creates its own tenant and stores. Exits non-zero if any check
// fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { eventBus } = await import("../src/events/eventBus.ts");
const { registerDashboardCacheHandlers } = await import("../src/events/dashboardCache.handlers.ts");
const { periodWindows } = await import("../src/services/Dashboards/storeRevenue.ts");
const { StoreDashboardService } = await import("../src/services/Dashboards/StoreDashboard.service.ts");
const { TenantDashboardService } = await import("../src/services/tenant/TenantDashboard.service.ts");
const { DailyReconciliationService } = await import("../src/services/payment/DailyReconciliation.service.ts");
const { getCacheVersion } = await import("../src/infrastructure/cache/cacheVersion.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1559${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;
const MIN = 60_000;

// Two zones where it is between 07:00 and 21:00 now, so "today so far" is
// long enough for the sales below and the server's day doesn't line up
const ZONES = ["America/New_York", "Asia/Tokyo", "Europe/London", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland", "America/Sao_Paulo", "Africa/Nairobi"];
const daytime = ZONES.filter((tz) => { const h = dayjs().tz(tz).hour(); return h >= 7 && h < 21; });
if (daytime.length < 2) throw new Error("No two daytime zones right now; re-run in a few minutes");
const [TZ1, TZ2] = daytime;
const localMidnight = (tz: string) => dayjs.tz(dayjs().tz(tz).format("YYYY-MM-DD"), tz).toDate();
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MIN);

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Dash" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Dash ${runId}`, slug: `dash-${runId}`, email: `dash-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const member = await prisma.tenantUser.create({ data: { tenantUuid: tenant.uuid, userUuid: owner.uuid, slug: `dash-owner-${runId}` } });
    const store = (label: string, tz: string) => prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: `Dash ${label}`, slug: `dash-${label.toLowerCase()}-${runId}`, city: "Test", timezone: tz },
    });
    return { tenant, member, store1: await store("One", TZ1), store2: await store("Two", TZ2) };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

// An order and its payment, collected at `when` (paidAt for online,
// processedAt for cashier payments)
async function sale(ctx: Ctx, storeUuid: string, opts: {
    amount: number; when: Date; method: "CASH" | "CARD_TERMINAL" | "STRIPE"; status: string;
}) {
    const order = await prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid, tenantUserUuid: ctx.member.uuid, orderNumber: `DB-${runId}-${seq++}`,
            subtotal: opts.amount, totalAmount: opts.amount, menuVersion: 1, pricingSnapshot: {}, status: "COMPLETED",
            createdAt: at(opts.when, -2),
        },
    });
    const online = opts.method === "STRIPE";
    const collected = !["PENDING", "FAILED"].includes(opts.status);
    return prisma.payment.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid, orderUuid: order.uuid, amount: opts.amount, currency: "USD", subtotal: opts.amount, tax: 0,
            paymentFlow: online ? "PROVIDER" : "CASHIER", paymentMethod: online ? "STRIPE" : opts.method,
            provider: online ? "STRIPE" : null, providerRef: online ? `pi_${runId}_${seq++}` : null, status: opts.status as any,
            snapshot: {}, orderSnapshot: {}, pricingRules: {},
            ...(opts.status === "FAILED" ? { failedAt: opts.when } : !collected ? {} : online ? { paidAt: opts.when } : { processedAt: opts.when }),
        },
    });
}

async function refund(ctx: Ctx, p: { uuid: string; orderUuid: string; storeUuid: string }, amount: number, provider: string, when: Date) {
    return prisma.refund.create({
        data: {
            tenantUuid: ctx.tenant.uuid, paymentUuid: p.uuid, orderUuid: p.orderUuid, storeUuid: p.storeUuid, amount, currency: "USD",
            type: "PARTIAL", status: "COMPLETED", reason: "test", provider, snapshot: {}, processedAt: when,
        },
    });
}

async function main() {
    const ctx = await setup();
    console.log(`Run ${runId} (stores in ${TZ1} and ${TZ2})`);

    // ── 1. Periods ──
    console.log("\n1. Periods (America/New_York)");
    const ny = [{ uuid: "s", timezone: "America/New_York" }];
    const nyNow = new Date("2026-10-16T14:00:00Z"); // 10:00 EDT, a Friday
    const today = periodWindows(ny, "today", nyNow);
    check("today starts at local midnight", today.current[0].gte.toISOString(), "2026-10-16T04:00:00.000Z");
    check("  ...previous: yesterday up to the same time", `${today.previous[0].gte.toISOString()} ${today.previous[0].lt.toISOString()}`, "2026-10-15T04:00:00.000Z 2026-10-15T14:00:00.000Z");
    check("week starts Sunday local midnight", periodWindows(ny, "week", nyNow).current[0].gte.toISOString(), "2026-10-11T04:00:00.000Z");
    const month = periodWindows(ny, "month", nyNow);
    check("month / previous month", `${month.current[0].gte.toISOString()} ${month.previous[0].gte.toISOString()}`, "2026-10-01T04:00:00.000Z 2026-09-01T04:00:00.000Z");
    check("year starts at EST midnight", periodWindows(ny, "year", nyNow).current[0].gte.toISOString(), "2026-01-01T05:00:00.000Z");
    const dst = periodWindows(ny, "today", new Date("2026-11-02T15:00:00Z")); // 10:00 EST, day after DST ends
    check("after DST: today at EST midnight, yesterday at EDT midnight", `${dst.current[0].gte.toISOString()} ${dst.previous[0].gte.toISOString()}`, "2026-11-02T05:00:00.000Z 2026-11-01T04:00:00.000Z");
    check("unknown timezone falls back to UTC", periodWindows([{ uuid: "s", timezone: "Mars/Olympus" }], "today", nyNow).current[0].gte.toISOString(), "2026-10-16T00:00:00.000Z");

    // ── 2. Revenue ──
    console.log("\n2. Revenue");
    const s1 = ctx.store1.uuid, s2 = ctx.store2.uuid;
    const L1 = localMidnight(TZ1), L2 = localMidnight(TZ2);
    await sale(ctx, s1, { amount: 1000, when: at(L1, 1), method: "CASH", status: "COMPLETED" });             // just after local midnight
    await sale(ctx, s1, { amount: 400, when: at(L1, -1), method: "CASH", status: "COMPLETED" });             // just before: yesterday
    await sale(ctx, s1, { amount: 300, when: at(L1, -24 * 60 + 30), method: "CASH", status: "COMPLETED" }); // yesterday, by this time of day
    const card = await sale(ctx, s1, { amount: 2000, when: at(L1, 60), method: "CARD_TERMINAL", status: "PARTIALLY_REFUNDED" });
    await refund(ctx, card, 500, "CARD_TERMINAL", at(L1, 90));
    const online = await sale(ctx, s1, { amount: 3000, when: at(L1, 30), method: "STRIPE", status: "PAID" });
    await prisma.settlement.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: s1, paymentUuid: online.uuid, provider: "STRIPE",
            providerRef: online.providerRef!, grossAmount: 3000, providerFee: 117, netAmount: 2883,
        },
    });
    const refunded = await sale(ctx, s1, { amount: 1500, when: at(L1, 40), method: "STRIPE", status: "REFUNDED" });
    await refund(ctx, refunded, 1500, "STRIPE", at(L1, 50));
    await sale(ctx, s1, { amount: 800, when: at(L1, 45), method: "STRIPE", status: "PENDING" });
    await sale(ctx, s1, { amount: 900, when: at(L1, 20), method: "STRIPE", status: "FAILED" });
    await sale(ctx, s2, { amount: 600, when: at(L2, 10), method: "CASH", status: "COMPLETED" });
    // gross 1000 + 2000 + 3000 + 1500 = 7500; refunds 2000; fee 117; net 5383

    const store = await StoreDashboardService.getOverview(s1);
    check("store: local date", store.date, dayjs().tz(TZ1).format("YYYY-MM-DD"));
    check("store: gross / refunds / fees", `${store.revenue.gross}/${store.revenue.refunds}/${store.revenue.providerFees}`, "7500/2000/117");
    check("store: revenue today = net", store.revenue.today, 5383);
    check("store: failed payments today", store.performance.failedPayments, 1);

    const recon = await DailyReconciliationService.reconcileStoreDay(s1, store.date);
    check("store revenue equals the day's reconciliation (gross / net)",
        `${store.revenue.gross}/${store.revenue.today}`, `${recon.grossCollected}/${recon.netCollected}`);

    const dash = await TenantDashboardService.getDashboard(ctx.tenant.uuid, "today");
    check("tenant: revenue across both stores' local days", dash.overview.revenue, 5983);
    check("  ...gross / refunds / fees", `${dash.overview.revenueDetail.gross}/${dash.overview.revenueDetail.refunds}/${dash.overview.revenueDetail.providerFees}`, "8100/2000/117");
    const b = dash.revenueBreakdown;
    check("  ...by channel, net of refunds (cash/card/online)", `${b.cash}/${b.card}/${b.online}`, "1600/1500/3000");
    check("  ...channels - fees = total", b.cash + b.card + b.online - b.providerFees, b.total);
    check("  ...change against yesterday so far (300)", dash.overview.revenueChange, Math.round(((5983 - 300) / 300) * 10000) / 100);
    const byStore = new Map(dash.stores.map((s) => [s.storeUuid, s.revenue]));
    check("  ...per store", `${byStore.get(s1)}/${byStore.get(s2)}`, "5383/600");

    const overview = await TenantDashboardService.getOverview(ctx.tenant.uuid);
    check("tenant overview (no dates): same revenue", overview.revenue, 5983);
    const trend = await TenantDashboardService.getRevenueTrend(ctx.tenant.uuid);
    check("revenue trend totals: same revenue", trend.totals.revenue, 5983);
    const day1 = trend.data.find((d) => d.period === store.date);
    check("  ...store one's local day bucket holds its sales", (day1?.gross ?? 0) >= 7500, true);

    // ── 3. Caching ──
    console.log("\n3. Caching");
    registerDashboardCacheHandlers();
    const tenantRevenue = async () => (await TenantDashboardService.getOverview(ctx.tenant.uuid)).revenue;
    const storeRevenue = async () => (await StoreDashboardService.getOverview(s1)).revenue.today;

    // A sale written straight to the database, no event: a cached read
    // can't see it
    const quietSale = (amount: number) => sale(ctx, s1, { amount, when: new Date(Date.now() - MIN), method: "CASH", status: "COMPLETED" });

    await quietSale(100);
    const reads: number[] = [];
    for (let i = 0; i < 10; i++) reads.push(await tenantRevenue());
    check("tenant overview: 10 repeat reads served from cache", reads.filter((r) => r === 5983).length, 10);
    check("store overview: served from cache", await storeRevenue(), 5383);

    const explicit = { dateFrom: at(L1, 0), dateTo: new Date() };
    const e1 = (await TenantDashboardService.getOverview(ctx.tenant.uuid, explicit)).revenue;
    await quietSale(50);
    const e2 = (await TenantDashboardService.getOverview(ctx.tenant.uuid, explicit)).revenue;
    check("explicit date range: second read is a cache hit", e2, e1);

    const order = await prisma.order.findFirstOrThrow({ where: { storeUuid: s1 }, select: { uuid: true } });
    const statusChange = (to: string) => eventBus.emit("ORDER_STATUS_CHANGED", {
        orderUuid: order.uuid, tenantUuid: ctx.tenant.uuid, storeUuid: s1, from: "PAID", to, timestamp: new Date(),
    });

    await statusChange("PREPARING");
    check("status -> PREPARING: store overview rebuilt", await storeRevenue(), 5533);
    check("  ...tenant dashboards kept", await tenantRevenue(), 5983);

    await statusChange("COMPLETED");
    check("status -> COMPLETED: tenant overview rebuilt", await tenantRevenue(), 6133);

    const staffBefore = await getCacheVersion(`store:${s1}:staff-dashboard`);
    await quietSale(200);
    await eventBus.emit("CASHIER_PAYMENT_COMPLETED", { paymentUuid: "p", orderUuid: order.uuid, tenantUuid: ctx.tenant.uuid, storeUuid: s1, amount: 200 });
    check("cashier payment: store overview rebuilt", await storeRevenue(), 5733);
    check("  ...tenant overview rebuilt", await tenantRevenue(), 6333);
    check("  ...staff dashboards' version bumped", Number(await getCacheVersion(`store:${s1}:staff-dashboard`)), Number(staffBefore) + 1);

    await refund(ctx, { uuid: online.uuid, orderUuid: online.orderUuid, storeUuid: s1 }, 333, "STRIPE", new Date(Date.now() - MIN));
    await eventBus.emit("REFUND_COMPLETED", { refundUuid: "r", paymentUuid: online.uuid, orderUuid: online.orderUuid, tenantUuid: ctx.tenant.uuid, storeUuid: s1, amount: 333 });
    check("refund: tenant revenue drops by it", await tenantRevenue(), 6000);

    const otherVersion = await getCacheVersion(`store:${s2}:dashboard`);
    await eventBus.emit("PAYMENT_CONFIRMED", { paymentUuid: "p", orderUuid: order.uuid, tenantUuid: ctx.tenant.uuid, storeUuid: s1, amount: 1 });
    check("events for one store leave the other's cache alone", await getCacheVersion(`store:${s2}:dashboard`), otherVersion);
}

let exitCode = 0;
try {
    await main();
    console.log(failures === 0 ? "\nAll dashboard checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nDashboard test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
