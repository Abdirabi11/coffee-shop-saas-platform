// LOCAL POS REFUND CHECKS (Phase 43)
// Calls the refund services, and the cashier refund route over HTTP, against
// the local database:
//
//   1. Card-terminal refunds - not sent to a provider (the processor leaves
//      them REQUESTED); a manager marks one paid back after keying it on the
//      card reader (cashiers can't), once, and the payment follows.
//   2. Over-refund guard on requests - every committed refund (requested,
//      in flight, completed, awaiting approval) counts, concurrent requests
//      can't exceed the payment, failed/rejected ones release their amount.
//   3. Several partial refunds - a PARTIALLY_REFUNDED payment takes further
//      refunds up to what's left, then REFUNDED.
//   4. Over-refund guard on payouts - cash payouts and card marks re-check
//      the limit under the payment's lock (also when racing), and refuse a
//      payment voided since the request.
//
//   npx tsx scripts/test-pos-refunds.ts
//
// Each run creates its own users, tenant and store. Exits non-zero if any
// check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: express } = await import("express");
const { default: prisma } = await import("../src/config/prisma.ts");
const { signAccessToken } = await import("../src/utils/jwt.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { CashDrawerService } = await import("../src/services/staff/CashDrawer.service.ts");
const { CashierPaymentService } = await import("../src/services/payment/cashier/payment.cashier.service.ts");
const { RefundService } = await import("../src/services/payment/Refund.service.ts");
const { default: cashierRoutes } = await import("../src/routes/payment/CashierPayment.routes.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}
const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];
const settle = <T>(p: Promise<T>) => p.then(() => "ok", (e) => errorCode(e));
function tally(values: string[]) {
    const c = new Map<string, number>();
    for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
    return [...c].map(([k, n]) => `${k} x${n}`).join(", ");
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1556${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Refunds" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Refunds ${runId}`, slug: `refunds-${runId}`, email: `refunds-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const plan = await prisma.plan.create({ data: { name: `Refunds ${runId}`, slug: `refunds-${runId}` } });
    await prisma.planVersion.create({ data: { planUuid: plan.uuid, version: 1, priceMonthly: 0, features: {} } });
    await prisma.planPrice.create({ data: { planUuid: plan.uuid, interval: "MONTHLY", amount: 0 } });
    await SubscriptionService.createSubscription({ tenantUuid: tenant.uuid, planUuid: plan.uuid, interval: "MONTHLY" });

    const store = await prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: "Refunds S1", slug: `refunds-s1-${runId}`, city: "Mogadishu" },
    });
    await prisma.storeOpeningHour.createMany({
        data: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
            tenantUuid: tenant.uuid, storeUuid: store.uuid, dayOfWeek: day as any, periods: [], is24Hours: true,
        })),
    });
    return { tenant, store };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

async function person(ctx: Ctx, name: string, role?: "CASHIER" | "MANAGER") {
    const user = await prisma.user.create({ data: { phoneNumber: phone(), firstName: name, lastName: "Refunds" } });
    const member = await prisma.tenantUser.create({
        data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, slug: `refunds-${name.toLowerCase()}-${runId}-${seq++}` },
    });
    if (role) {
        await prisma.userStore.create({
            data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, tenantUserUuid: member.uuid, storeUuid: ctx.store.uuid, role, canOpenDrawer: true },
        });
    }
    return { user, member };
}

// A paid order: CARD_TERMINAL, or CASH into the given drawer's terminal
async function sale(ctx: Ctx, customerMember: string, by: string, amount: number, method: "CASH" | "CARD_TERMINAL", terminalId = `CARD-${runId}`) {
    const order = await prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store.uuid, tenantUserUuid: customerMember,
            orderNumber: `REF-${runId}-${seq++}`, subtotal: amount, totalAmount: amount, menuVersion: 1, pricingSnapshot: {},
        },
    });
    const payment = await CashierPaymentService.processPayment({
        orderUuid: order.uuid, tenantUuid: ctx.tenant.uuid, paymentMethod: method, amount,
        ...(method === "CASH" && { amountTendered: amount, changeGiven: 0 }),
        processedBy: by, deviceId: "refund-test", terminalId, idempotencyKey: crypto.randomUUID(),
    });
    return { order, payment };
}

const paymentStatus = async (uuid: string) => (await prisma.payment.findUniqueOrThrow({ where: { uuid } })).status;
const refundStatus = async (uuid: string) => (await prisma.refund.findUniqueOrThrow({ where: { uuid } })).status;
const committed = async (paymentUuid: string) => (await prisma.refund.aggregate({
    where: { paymentUuid, status: { in: ["PENDING_APPROVAL", "REQUESTED", "PROCESSING", "COMPLETED"] } },
    _sum: { amount: true },
}))._sum.amount ?? 0;

async function main() {
    const ctx = await setup();
    console.log(`Run ${runId}`);
    const cashier = await person(ctx, "Cashier", "CASHIER");
    const manager = await person(ctx, "Manager", "MANAGER");
    const customer = await person(ctx, "Customer");

    const app = express();
    app.use(express.json());
    app.use("/api/cashier", cashierRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = (u: { uuid: string; globalRole: string; tokenVersion: number }) =>
        signAccessToken({ userUuid: u.uuid, role: u.globalRole as any, tenantUuid: ctx.tenant.uuid, tokenVersion: u.tokenVersion });
    const markCard = async (who: typeof cashier, refundUuid: string, body: unknown = {}) => {
        const res = await fetch(`${base}/api/cashier/refunds/${refundUuid}/mark-card-refunded`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token(who.user)}`, "Content-Type": "application/json", "x-tenant-uuid": ctx.tenant.uuid },
            body: JSON.stringify(body),
        });
        const json: any = await res.json().catch(() => null);
        return `${res.status} ${json?.error ? errorCode({ message: json.error }) : json?.data?.status ?? ""}`.trim();
    };
    const mark = (refundUuid: string) => RefundService.markCardRefunded({ tenantUuid: ctx.tenant.uuid, refundUuid, markedBy: manager.user.uuid });
    const request = (orderUuid: string, amount?: number) =>
        RefundService.requestRefund({ orderUuid, amount, reason: "Test refund", requestedBy: manager.user.uuid });

    try {
        // ── 1. Card-terminal refunds ──
        console.log("\n1. Card-terminal refunds");
        const card = await sale(ctx, customer.member.uuid, cashier.user.uuid, 800, "CARD_TERMINAL");
        const cardRefund = await request(card.order.uuid);
        check("full refund requested on a card sale", `${cardRefund.status} ${cardRefund.provider} ${cardRefund.amount}`, "REQUESTED CARD_TERMINAL 800");
        await RefundService.processRefund(cardRefund.uuid);
        check("processor leaves it for the terminal (not FAILED)", await refundStatus(cardRefund.uuid), "REQUESTED");
        const queued = await prisma.refund.findMany({
            where: { uuid: cardRefund.uuid, status: "REQUESTED", provider: { notIn: (await import("../src/services/payment/Refund.service.ts")).MANUAL_REFUND_PROVIDERS } },
        });
        check("  ...not in the processor job's queue", queued.length, 0);

        check("cashier marks it refunded", await markCard(cashier, cardRefund.uuid), "403 INSUFFICIENT_ROLE");
        check("  ...bad terminal reference", await markCard(manager, cardRefund.uuid, { terminalReference: 42 }), "400 INVALID_TERMINAL_REFERENCE");
        const marks = await Promise.all([1, 2, 3].map(() => markCard(manager, cardRefund.uuid, { terminalReference: "AUTH-123456" })));
        console.log(`    3 concurrent manager marks: ${tally(marks)}`);
        check("  marked once", marks.filter((m) => m === "200 COMPLETED").length, 1);
        check("  ...others refused", marks.filter((m) => m === "409 REFUND_NOT_PAYABLE").length, 2);
        const done = await prisma.refund.findUniqueOrThrow({ where: { uuid: cardRefund.uuid } });
        check("  ...terminal reference and who marked it recorded", `${done.providerRef} ${(done.metadata as any)?.cardTerminalRefund?.markedBy === manager.user.uuid}`, "AUTH-123456 true");
        check("  ...payment REFUNDED", await paymentStatus(card.payment.uuid), "REFUNDED");

        const cashForCard = await sale(ctx, customer.member.uuid, cashier.user.uuid, 300, "CARD_TERMINAL");
        const notCard = await prisma.refund.create({
            data: {
                tenantUuid: ctx.tenant.uuid, paymentUuid: cashForCard.payment.uuid, orderUuid: cashForCard.order.uuid, storeUuid: ctx.store.uuid,
                amount: 100, currency: cashForCard.payment.currency, type: "PARTIAL", status: "REQUESTED", reason: "t", provider: "CASH", snapshot: {},
            },
        });
        check("marking a cash refund as card", await markCard(manager, notCard.uuid), "409 NOT_A_CARD_TERMINAL_REFUND");
        check("marking a refund of another tenant / unknown", await markCard(manager, crypto.randomUUID()), "404 NOT_FOUND");
        await prisma.refund.update({ where: { uuid: notCard.uuid }, data: { status: "REJECTED" } });

        // ── 2. Over-refund guard on requests ──
        console.log("\n2. Over-refund guard on requests");
        const p750 = await sale(ctx, customer.member.uuid, cashier.user.uuid, 750, "CARD_TERMINAL");
        const pair = await Promise.all([settle(request(p750.order.uuid, 500)), settle(request(p750.order.uuid, 500))]);
        console.log(`    $5 + $5 at once on $7.50: ${tally(pair)}`);
        check("  one refused", pair.filter((r) => r === "REFUND_AMOUNT_EXCEEDS_LIMIT").length, 1);
        check("  committed against the payment", await committed(p750.payment.uuid), 500);
        check("more than what's left (requested, not yet paid, counts)", await settle(request(p750.order.uuid, 300)), "REFUND_AMOUNT_EXCEEDS_LIMIT");
        check("zero / fractional amount", `${await settle(request(p750.order.uuid, 0))} ${await settle(request(p750.order.uuid, 1.5))}`, "INVALID_REFUND_AMOUNT INVALID_REFUND_AMOUNT");
        const rest = await request(p750.order.uuid);
        check("no amount: refunds exactly what's left", rest.amount, 250);
        check("nothing left", await settle(request(p750.order.uuid, 1)), "NOTHING_TO_REFUND");

        // A failed or rejected refund gives its amount back
        await prisma.refund.update({ where: { uuid: rest.uuid }, data: { status: "FAILED" } });
        check("after the 250 failed, request 250 again", (await request(p750.order.uuid, 250)).amount, 250);
        // A refund parked for approval holds its amount
        const parked = await sale(ctx, customer.member.uuid, cashier.user.uuid, 400, "CARD_TERMINAL");
        const parkedRefund = await request(parked.order.uuid, 300);
        await prisma.refund.update({ where: { uuid: parkedRefund.uuid }, data: { status: "PENDING_APPROVAL" } });
        check("a 300 awaiting approval holds its amount", await settle(request(parked.order.uuid, 200)), "REFUND_AMOUNT_EXCEEDS_LIMIT");

        const p1000 = await sale(ctx, customer.member.uuid, cashier.user.uuid, 1000, "CARD_TERMINAL");
        const many = await Promise.all(Array.from({ length: 8 }, () => settle(request(p1000.order.uuid, 300))));
        console.log(`    8 concurrent 300 requests on 1000: ${tally(many)}`);
        check("  three fit", many.filter((r) => r === "ok").length, 3);
        check("  committed stays within the payment", await committed(p1000.payment.uuid), 900);

        // ── 3. Several partial refunds ──
        console.log("\n3. Several partial refunds");
        const drawer = await CashDrawerService.openDrawer({
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store.uuid, userUuid: cashier.user.uuid, startingCash: 5000,
            terminalId: `CASH-${runId}`, openedBy: cashier.user.uuid,
        });
        const payOut = (refundUuid: string) => RefundService.payCashRefund({
            tenantUuid: ctx.tenant.uuid, refundUuid, drawerUuid: drawer.uuid, paidBy: cashier.user.uuid, actorIsSupervisor: false,
        });
        const cash = await sale(ctx, customer.member.uuid, cashier.user.uuid, 800, "CASH", `CASH-${runId}`);
        await payOut((await request(cash.order.uuid, 300)).uuid);
        check("first partial paid out", await paymentStatus(cash.payment.uuid), "PARTIALLY_REFUNDED");
        const second = await settle(request(cash.order.uuid, 200));
        check("second partial on a PARTIALLY_REFUNDED payment", second, "ok");
        const secondRefund = await prisma.refund.findFirstOrThrow({ where: { paymentUuid: cash.payment.uuid, status: "REQUESTED" } });
        await payOut(secondRefund.uuid);
        check("  ...paid out, still partially refunded", await paymentStatus(cash.payment.uuid), "PARTIALLY_REFUNDED");
        check("more than the 300 left", await settle(request(cash.order.uuid, 400)), "REFUND_AMOUNT_EXCEEDS_LIMIT");
        const last = await request(cash.order.uuid);
        check("the rest", last.amount, 300);
        await payOut(last.uuid);
        check("  ...paid out: payment REFUNDED", await paymentStatus(cash.payment.uuid), "REFUNDED");
        check("refund on a REFUNDED payment", await settle(request(cash.order.uuid, 1)), "PAYMENT_NOT_REFUNDABLE");
        const t = await CashDrawerService.expectedTotals(prisma as any, await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: drawer.uuid }, include: { cashDrops: true } }));
        check("drawer: 5000 + 800 sale - 800 refunded", t.expectedCash, 5000);

        // Card partials, marked one by one
        const p600 = await sale(ctx, customer.member.uuid, cashier.user.uuid, 600, "CARD_TERMINAL");
        await mark((await request(p600.order.uuid, 200)).uuid);
        check("card: first partial marked", await paymentStatus(p600.payment.uuid), "PARTIALLY_REFUNDED");
        await mark((await request(p600.order.uuid, 400)).uuid);
        check("  ...second marked: REFUNDED", await paymentStatus(p600.payment.uuid), "REFUNDED");

        // ── 4. Over-refund guard on payouts ──
        // Refund rows that got past the request check some other way (written
        // before this guard, or by hand): the payout re-checks under the lock
        console.log("\n4. Over-refund guard on payouts");
        const rawRefund = (payment: { uuid: string; orderUuid: string; currency: string }, amount: number, provider: string) => prisma.refund.create({
            data: {
                tenantUuid: ctx.tenant.uuid, paymentUuid: payment.uuid, orderUuid: payment.orderUuid, storeUuid: ctx.store.uuid,
                amount, currency: payment.currency, type: "PARTIAL", status: "REQUESTED", reason: "legacy", provider, snapshot: {},
            },
        });
        const cash75 = await sale(ctx, customer.member.uuid, cashier.user.uuid, 750, "CASH", `CASH-${runId}`);
        const [a, b] = [await rawRefund(cash75.payment, 500, "CASH"), await rawRefund(cash75.payment, 500, "CASH")];
        const payouts = await Promise.all([settle(payOut(a.uuid)), settle(payOut(b.uuid))]);
        console.log(`    two $5 cash payouts at once on $7.50: ${tally(payouts)}`);
        check("  one paid, one refused", payouts.filter((p) => p === "REFUND_AMOUNT_EXCEEDS_LIMIT").length, 1);
        check("  cash refunded on the payment", (await prisma.refund.aggregate({ where: { paymentUuid: cash75.payment.uuid, status: "COMPLETED" }, _sum: { amount: true } }))._sum.amount, 500);

        const card75 = await sale(ctx, customer.member.uuid, cashier.user.uuid, 750, "CARD_TERMINAL");
        const [c, d] = [await rawRefund(card75.payment, 500, "CARD_TERMINAL"), await rawRefund(card75.payment, 500, "CARD_TERMINAL")];
        const cardMarks = await Promise.all([settle(mark(c.uuid)), settle(mark(d.uuid))]);
        console.log(`    two $5 card marks at once on $7.50: ${tally(cardMarks)}`);
        check("  one marked, one refused", cardMarks.filter((m) => m === "REFUND_AMOUNT_EXCEEDS_LIMIT").length, 1);
        check("  ...the refused one stays REQUESTED", (await Promise.all([c, d].map((r) => refundStatus(r.uuid)))).sort().join(" "), "COMPLETED REQUESTED");

        const voided = await sale(ctx, customer.member.uuid, cashier.user.uuid, 500, "CARD_TERMINAL");
        const beforeVoid = await request(voided.order.uuid);
        await prisma.payment.update({ where: { uuid: voided.payment.uuid }, data: { status: "VOIDED" } });
        check("mark after the payment was voided", await settle(mark(beforeVoid.uuid)), "PAYMENT_NOT_REFUNDABLE");
        check("  ...refund still REQUESTED", await refundStatus(beforeVoid.uuid), "REQUESTED");
    } finally {
        server.close();
    }
}

let exitCode = 0;
try {
    await main();
    console.log(failures === 0 ? "\nAll POS refund checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nPOS refund test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
