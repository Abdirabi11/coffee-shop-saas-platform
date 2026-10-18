// LOCAL ANALYTICS & ALERT CHECKS (Phase 46)
// Builds a simulated store day in New York (UTC-4 in October) with orders
// and payments on both sides of local and UTC midnight, then checks:
//
//   1. Store days - a store comes up once its local clock reads 04:00, with
//      its previous two local calendar days, windowed at local midnights.
//   2. Money metrics (AnalyticsAggregationJob) - StoreDailyMetrics gross,
//      refunds, net, tax, payments succeeded / failed for the local day,
//      equal to the day's DailyReconciliation; a real-time row for the day
//      is overwritten, and a re-run changes nothing.
//   3. Order metrics (DailyStoreMetricsJob, OrderMetricsCalculationJob) -
//      orders by status, revenue, customers, items and prep time for the
//      local day, from aggregates.
//   4. Alert dedup - stuck, delayed and low-stock alerts are raised once per
//      order / product per 24 hours however often the jobs run, even after
//      being resolved; an alert older than that doesn't block a new one.
//   5. Email - a failed send returns { success: false } instead of
//      throwing, and doesn't roll back the transaction it was sent from.
//
//   npx tsx scripts/test-analytics-alerts.ts
//
// Each run creates its own tenant and stores. Exits non-zero if any check
// fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
// Nothing listens here: every send fails fast
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "1";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { storeDaysDue } = await import("../src/jobs/Analytics/storeDays.ts");
const { AnalyticsAggregationJob } = await import("../src/jobs/Analytics/AnalyticsAggregation.job.ts");
const { DailyStoreMetricsJob } = await import("../src/jobs/Order/dailyStoreMetrics.job.ts");
const { OrderMetricsCalculationJob } = await import("../src/jobs/Order/orderMetricsCalculation.job.ts");
const { DailyReconciliationService } = await import("../src/services/payment/DailyReconciliation.service.ts");
const { DetectStuckOrdersJob } = await import("../src/jobs/Order/detectStuckOrders.job.ts");
const { OrderTimeoutAlertJob } = await import("../src/jobs/Order/orderTimeoutAlert.job.ts");
const { LowStockAlertJob } = await import("../src/jobs/Product/lowStockAlert.job.ts");
const { EmailService } = await import("../src/services/notification/Email.service.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1558${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

// The simulated day: Thursday 2026-10-15 in New York (EDT, UTC-4)
const DAY = "2026-10-15";
const DAY_KEY = new Date(`${DAY}T00:00:00Z`);
const ny = (local: string) => new Date(`${local}-04:00`);
// 04:20 in New York on the 16th: the metrics jobs' hour there
const NY_0420 = new Date("2026-10-16T08:20:00Z");

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Metrics" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Metrics ${runId}`, slug: `metrics-${runId}`, email: `metrics-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const store = (label: string, timezone: string) => prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: `Metrics ${label}`, slug: `metrics-${label.toLowerCase()}-${runId}`, city: "New York", timezone },
    });
    // Joined long before the day: a returning customer
    const regular = await prisma.tenantUser.create({
        data: { tenantUuid: tenant.uuid, userUuid: owner.uuid, slug: `metrics-owner-${runId}`, createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    // Joined during the day: a new customer
    const newcomerUser = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "New", lastName: "Customer" } });
    const newcomer = await prisma.tenantUser.create({
        data: { tenantUuid: tenant.uuid, userUuid: newcomerUser.uuid, slug: `metrics-new-${runId}`, createdAt: ny(`${DAY}T09:00:00`) },
    });
    return {
        tenant, regular, newcomer,
        moneyStore: await store("Money", "America/New_York"),
        ordersStore: await store("Orders", "America/New_York"),
        tokyoStore: await store("Tokyo", "Asia/Tokyo"),
        alertStore: await store("Alerts", "America/New_York"),
    };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

async function order(ctx: Ctx, opts: {
    storeUuid: string; total: number; createdAt: Date; status?: string; customer?: string; readyAfterMin?: number; tax?: number;
}) {
    return prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: opts.storeUuid, tenantUserUuid: opts.customer ?? ctx.regular.uuid,
            orderNumber: `MT-${runId}-${seq++}`, subtotal: opts.total, taxAmount: opts.tax ?? 0, totalAmount: opts.total,
            menuVersion: 1, pricingSnapshot: {}, status: (opts.status ?? "COMPLETED") as any, createdAt: opts.createdAt,
            actualReadyAt: opts.readyAfterMin != null ? new Date(opts.createdAt.getTime() + opts.readyAfterMin * 60_000) : null,
        },
    });
}

// An order and its payment, with the collection time set directly
async function sale(ctx: Ctx, opts: {
    amount: number; at: Date; method: "CASH" | "CARD_TERMINAL" | "STRIPE"; status: string; tax?: number;
}) {
    const o = await order(ctx, { storeUuid: ctx.moneyStore.uuid, total: opts.amount, createdAt: new Date(opts.at.getTime() - 5 * 60_000) });
    const online = opts.method === "STRIPE";
    const payment = await prisma.payment.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.moneyStore.uuid, orderUuid: o.uuid, amount: opts.amount, currency: "USD",
            subtotal: opts.amount, tax: opts.tax ?? 0, paymentFlow: online ? "PROVIDER" : "CASHIER", paymentMethod: online ? "STRIPE" : opts.method,
            provider: online ? "STRIPE" : null, providerRef: online ? `pi_${runId}_${seq++}` : null, status: opts.status as any,
            snapshot: {}, orderSnapshot: {}, pricingRules: {},
            ...(opts.status === "FAILED" ? { failedAt: opts.at } : online ? { paidAt: opts.at } : { processedAt: opts.at }),
        },
    });
    return payment;
}

async function refund(ctx: Ctx, p: { uuid: string; orderUuid: string; storeUuid: string }, amount: number, provider: string, at: Date) {
    return prisma.refund.create({
        data: {
            tenantUuid: ctx.tenant.uuid, paymentUuid: p.uuid, orderUuid: p.orderUuid, storeUuid: p.storeUuid, amount, currency: "USD",
            type: "PARTIAL", status: "COMPLETED", reason: "test", provider, snapshot: {}, processedAt: at,
        },
    });
}

const storeMetrics = (storeUuid: string) => prisma.storeDailyMetrics.findUnique({
    where: { tenantUuid_storeUuid_date: { tenantUuid: ctxTenant(), storeUuid, date: DAY_KEY } },
});
let ctxTenant = () => "";

// Moves an order's updatedAt back (Prisma sets it on every write)
const ageOrder = (uuid: string, minutes: number) =>
    prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${new Date(Date.now() - minutes * 60_000).toISOString()}::timestamp WHERE uuid = ${uuid}`;

const alertsFor = (entityId: string) => prisma.adminAlert.findMany({ where: { affectedEntityId: entityId }, orderBy: { createdAt: "asc" } });

async function main() {
    const ctx = await setup();
    ctxTenant = () => ctx.tenant.uuid;
    console.log(`Run ${runId}`);

    // ── 1. Store days ──
    console.log("\n1. Store days");
    const only = (storeUuid: string) => ({ storeUuids: [storeUuid] });
    check("NY store not due at 03:20 local", (await storeDaysDue(new Date("2026-10-16T07:20:00Z"), only(ctx.moneyStore.uuid))).length, 0);
    const nyDays = await storeDaysDue(NY_0420, only(ctx.moneyStore.uuid));
    check("NY store due at 04:20 local: the 15th and 14th", nyDays.map((d) => d.localDate).join(), "2026-10-15,2026-10-14");
    check("  ...the 15th is NY's local day", `${nyDays[0].start.toISOString()} ${nyDays[0].end.toISOString()}`, "2026-10-15T04:00:00.000Z 2026-10-16T04:00:00.000Z");
    check("  ...keyed by the calendar day", nyDays[0].dateKey.toISOString(), DAY_KEY.toISOString());
    check("Tokyo store not due at NY's 04:20", (await storeDaysDue(NY_0420, only(ctx.tokyoStore.uuid))).length, 0);
    const tokyo = await storeDaysDue(new Date("2026-10-15T19:20:00Z"), only(ctx.tokyoStore.uuid));
    check("Tokyo store at 04:20 Tokyo: its 15th starts 15:00Z on the 14th", `${tokyo[0]?.localDate} ${tokyo[0]?.start.toISOString()}`, `${DAY} 2026-10-14T15:00:00.000Z`);

    // ── 2. Money metrics ──
    console.log("\n2. Money metrics");
    await sale(ctx, { amount: 1000, at: ny(`${DAY}T23:50:00`), method: "CASH", status: "COMPLETED", tax: 80 }); // 03:50Z on the 16th
    await sale(ctx, { amount: 400, at: ny("2026-10-14T23:30:00"), method: "CASH", status: "COMPLETED" });       // 03:30Z on the 15th
    await sale(ctx, { amount: 700, at: ny("2026-10-16T00:10:00"), method: "CASH", status: "COMPLETED" });       // after local midnight
    const card = await sale(ctx, { amount: 2000, at: ny(`${DAY}T12:00:00`), method: "CARD_TERMINAL", status: "PARTIALLY_REFUNDED", tax: 160 });
    await refund(ctx, card, 500, "CARD_TERMINAL", ny(`${DAY}T15:00:00`));
    const online = await sale(ctx, { amount: 3000, at: ny(`${DAY}T09:00:00`), method: "STRIPE", status: "PAID" });
    await prisma.settlement.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.moneyStore.uuid, paymentUuid: online.uuid, provider: "STRIPE",
            providerRef: online.providerRef!, grossAmount: 3000, providerFee: 117, netAmount: 2883,
        },
    });
    await sale(ctx, { amount: 900, at: ny(`${DAY}T13:00:00`), method: "STRIPE", status: "FAILED" });
    await sale(ctx, { amount: 900, at: ny(`${DAY}T13:05:00`), method: "STRIPE", status: "FAILED" });

    // What the real-time handlers left for the day (garbage to be replaced)
    await prisma.storeDailyMetrics.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.moneyStore.uuid, date: DAY_KEY, revenueGross: 99_999, paymentsSucceeded: 42 },
    });

    const tooEarly = await AnalyticsAggregationJob.run(new Date("2026-10-16T07:20:00Z"), only(ctx.moneyStore.uuid));
    check("job at 03:20 local computes nothing", tooEarly.computed, 0);
    const agg = await AnalyticsAggregationJob.run(NY_0420, only(ctx.moneyStore.uuid));
    check("job at 04:20 local computes the 15th and 14th", `${agg.computed} ${agg.failed}`, "2 0");

    const m = await storeMetrics(ctx.moneyStore.uuid);
    check("gross: 23:50 sale in, previous/next-day sales out", m?.revenueGross, 6000);
    check("refunded", m?.revenueRefunded, 500);
    check("net = 6000 - 500 - 117 fee", m?.revenueNet, 5383);
    check("tax on collected payments", m?.revenueTax, 240);
    check("payments succeeded / failed", `${m?.paymentsSucceeded}/${m?.paymentsFailed}`, "3/2");
    check("avg payment value", m?.avgPaymentValue, 2000);
    const prev = await prisma.storeDailyMetrics.findUnique({
        where: { tenantUuid_storeUuid_date: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.moneyStore.uuid, date: new Date("2026-10-14T00:00:00Z") } },
    });
    check("the 14th gets the 23:30 sale", prev?.revenueGross, 400);

    const recon = await DailyReconciliationService.reconcileStoreDay(ctx.moneyStore.uuid, DAY);
    check("gross / refunds / net equal the day's reconciliation",
        `${m?.revenueGross}/${m?.revenueRefunded}/${m?.revenueNet}`, `${recon.grossCollected}/${recon.refundsTotal}/${recon.netCollected}`);

    await AnalyticsAggregationJob.run(NY_0420, only(ctx.moneyStore.uuid));
    const again = await storeMetrics(ctx.moneyStore.uuid);
    check("re-run changes nothing", `${again?.revenueGross} ${again?.revenueNet} ${again?.paymentsSucceeded}`, "6000 5383 3");

    // ── 3. Order metrics ──
    console.log("\n3. Order metrics");
    const os = ctx.ordersStore.uuid;
    await order(ctx, { storeUuid: os, total: 1200, createdAt: ny(`${DAY}T08:00:00`), readyAfterMin: 10 });
    await order(ctx, { storeUuid: os, total: 1800, createdAt: ny(`${DAY}T23:50:00`), readyAfterMin: 20, customer: ctx.newcomer.uuid }); // 03:50Z the 16th
    await order(ctx, { storeUuid: os, total: 600, createdAt: ny(`${DAY}T12:00:00`), status: "CANCELLED" });
    await order(ctx, { storeUuid: os, total: 900, createdAt: ny(`${DAY}T22:00:00`), status: "PREPARING" });
    await order(ctx, { storeUuid: os, total: 5000, createdAt: ny("2026-10-14T23:30:00"), readyAfterMin: 90 }); // 03:30Z the 15th: not the day
    await order(ctx, { storeUuid: os, total: 5000, createdAt: ny("2026-10-16T00:10:00") });                   // next local day
    const product = await prisma.product.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: os, name: `Latte ${runId}`, basePrice: 600 },
    });
    const withItems = await order(ctx, { storeUuid: os, total: 1800, createdAt: ny(`${DAY}T14:00:00`), customer: ctx.newcomer.uuid });
    for (const quantity of [2, 1]) {
        await prisma.orderItem.create({
            data: {
                tenantUuid: ctx.tenant.uuid, orderUuid: withItems.uuid, productUuid: product.uuid, productName: "Latte",
                basePrice: 600, quantity, unitPrice: 600, subtotal: 600 * quantity, finalPrice: 600 * quantity,
            },
        });
    }

    const daily = await DailyStoreMetricsJob.run(NY_0420, only(os));
    check("DailyStoreMetricsJob computes 2 days", `${daily.computed} ${daily.failed}`, "2 0");
    const sm = await storeMetrics(os);
    check("orders total / completed / cancelled / open", `${sm?.ordersTotal}/${sm?.ordersCompleted}/${sm?.ordersCancelled}/${sm?.ordersPending}`, "5/3/1/1");
    check("unique / new / returning customers", `${sm?.uniqueCustomers}/${sm?.newCustomers}/${sm?.returningCustomers}`, "2/1/1");
    check("items sold / per completed order", `${sm?.itemsSold} ${sm?.avgItemsPerOrder}`, "3 1");
    check("avg prep minutes (10 and 20)", sm?.avgPrepTimeMin, 15);

    const om = await OrderMetricsCalculationJob.run(NY_0420, only(os));
    check("OrderMetricsCalculationJob computes 2 days", `${om.processed} ${om.failed}`, "2 0");
    const odm = await prisma.orderDailyMetrics.findUnique({
        where: { tenantUuid_storeUuid_date: { tenantUuid: ctx.tenant.uuid, storeUuid: os, date: DAY_KEY } },
    });
    check("orders total / completed / cancelled", `${odm?.totalOrders}/${odm?.completedOrders}/${odm?.cancelledOrders}`, "5/3/1");
    check("revenue (completed) / avg order value", `${odm?.totalRevenue} ${odm?.avgOrderValue}`, "4800 1600");
    check("avg preparation time", odm?.avgPreparationTime, 15);

    // ── 4. Alert dedup ──
    console.log("\n4. Alert dedup");
    const as = ctx.alertStore.uuid;
    const stuck = await order(ctx, { storeUuid: as, total: 500, createdAt: new Date(Date.now() - 3 * 3_600_000), status: "PAID" });
    await ageOrder(stuck.uuid, 120);
    const firstStuck = await DetectStuckOrdersJob.run(only(as));
    const s1 = await alertsFor(stuck.uuid);
    check("stuck order: one alert", `${firstStuck} ${s1.length} ${s1[0]?.groupKey}`, `1 1 ORDER_STUCK:${stuck.uuid}`);
    await DetectStuckOrdersJob.run(only(as));
    await DetectStuckOrdersJob.run(only(as));
    const s2 = await alertsFor(stuck.uuid);
    check("  ...still one after two more runs, counted as duplicates", `${s2.length} ${s2[0]?.duplicateCount}`, "1 2");
    await prisma.adminAlert.update({ where: { uuid: s2[0].uuid }, data: { status: "RESOLVED", resolved: true } });
    await DetectStuckOrdersJob.run(only(as));
    check("  ...and after it is resolved within 24h", (await alertsFor(stuck.uuid)).length, 1);
    await prisma.$executeRaw`UPDATE "AdminAlert" SET "createdAt" = ${new Date(Date.now() - 25 * 3_600_000).toISOString()}::timestamp WHERE uuid = ${s2[0].uuid}`;
    await DetectStuckOrdersJob.run(only(as));
    check("  ...a new one once the last is over 24h old", (await alertsFor(stuck.uuid)).length, 2);

    const slow = await order(ctx, { storeUuid: as, total: 500, createdAt: new Date(Date.now() - 2 * 3_600_000), status: "PREPARING" });
    await ageOrder(slow.uuid, 45);
    await OrderTimeoutAlertJob.run(only(as));
    await OrderTimeoutAlertJob.run(only(as));
    const second = await OrderTimeoutAlertJob.run(only(as));
    const d = await alertsFor(slow.uuid);
    check("delayed order: one alert over three runs", `${d.length} ${d[0]?.groupKey}`, `1 ORDER_PREPARATION_DELAYED:${slow.uuid}`);
    check("  ...the order is still reported as delayed", second, 1);

    const low = await prisma.product.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: as, name: `Beans ${runId}`, basePrice: 1500, trackInventory: true, lowStockThreshold: 5 },
    });
    await prisma.inventoryItem.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: as, productUuid: low.uuid, quantity: 2, currentStock: 2, availableStock: 2 },
    });
    const lowFirst = await LowStockAlertJob.run(only(as));
    const lowSecond = await LowStockAlertJob.run(only(as));
    const l = await alertsFor(low.uuid);
    check("low stock: alert raised once (created first run / second run)", `${lowFirst}/${lowSecond}`, "1/0");
    check("  ...one INVENTORY_LOW alert", `${l.length} ${l[0]?.alertType}`, "1 INVENTORY_LOW");

    // ── 5. Email ──
    console.log("\n5. Email");
    const to = `nobody-${runId}@example.test`;
    let threw = false;
    let result: Awaited<ReturnType<typeof EmailService.send>> | undefined;
    try {
        result = await EmailService.send({ to, subject: "Test", template: "password-changed", data: { timestamp: "now" } });
    } catch {
        threw = true;
    }
    check("failed send doesn't throw", threw, false);
    check("  ...returns success: false", result?.success, false);
    const log = await prisma.emailLog.findFirst({ where: { to } });
    check("  ...and is logged as FAILED", log?.status, "FAILED");

    const inviteEmail = `invite-${runId}@example.test`;
    await prisma.$transaction(async (tx) => {
        await tx.adminAlert.create({ data: { tenantUuid: ctx.tenant.uuid, alertType: "CUSTOM", level: "INFO", title: inviteEmail } });
        await EmailService.send({ to: inviteEmail, subject: "Invite", template: "tenant-invitation", data: {} });
    }, { timeout: 30_000 });
    check("write in the sending transaction is committed", await prisma.adminAlert.count({ where: { title: inviteEmail } }), 1);
}

let exitCode = 0;
try {
    await main();
    console.log(failures === 0 ? "\nAll analytics & alert checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nAnalytics & alert test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
