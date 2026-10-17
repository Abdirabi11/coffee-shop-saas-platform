// LOCAL OPERATIONS CHECKS (Phase 41)
// Calls the staff, drawer, payment and refund services against the local
// database:
//
//   1. Payroll - clock-out pays time on the clock minus UNPAID/MEAL breaks
//      (PAID breaks stay paid); one open time entry per person across all
//      stores, also under concurrency; a shift must be the caller's, at that
//      store; no break on a closed entry; payroll counts approved hours only.
//   2. Drawers - one open drawer per person and per terminal (also under
//      concurrency), a terminal is required, a revoked assignment can't
//      open one; cash payments racing a close never land on the closed
//      drawer, and the close counts exactly the payments linked to it.
//   3. Cash refunds - left alone by the provider processor, paid out of an
//      open drawer once (also under concurrency), counted against the drawer
//      that paid them (not the one that took the sale), refused without an
//      open drawer or enough cash in it.
//   4. Store / tenant shutdown - an inactive store takes no orders, clock-ins,
//      PIN logins, drawer openings or offline syncs; socket rooms refuse it.
//   5. Reconciling an auto-closed drawer - needs a count from someone other
//      than its owner, then closes with the variance.
//
//   npx tsx scripts/test-operations.ts
//
// Each run creates its own users, tenant and stores. Exits non-zero if any
// check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: bcrypt } = await import("bcrypt");
const { default: prisma } = await import("../src/config/prisma.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { TimeEntryService } = await import("../src/services/staff/TimeEntry.service.ts");
const { PayrollExportService } = await import("../src/services/staff/PayrollExport.service.ts");
const { CashDrawerService } = await import("../src/services/staff/CashDrawer.service.ts");
const { StaffManagementService } = await import("../src/services/staff/StaffManagement.service.ts");
const { CashierPaymentService } = await import("../src/services/payment/cashier/payment.cashier.service.ts");
const { RefundService } = await import("../src/services/payment/Refund.service.ts");
const { OrderCommandService } = await import("../src/services/order/OrderCommand.service.ts");
const { OrderSyncService } = await import("../src/services/sync/OrderSync.service.ts");
const { canJoinDashboardRoom } = await import("../src/websockets/DashboardSocket.ts");

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
const phone = () => `+1555${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Ops" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Ops ${runId}`, slug: `ops-${runId}`, email: `ops-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const plan = await prisma.plan.create({ data: { name: `Ops ${runId}`, slug: `ops-${runId}` } });
    await prisma.planVersion.create({ data: { planUuid: plan.uuid, version: 1, priceMonthly: 0, features: {} } });
    await prisma.planPrice.create({ data: { planUuid: plan.uuid, interval: "MONTHLY", amount: 0 } });
    await SubscriptionService.createSubscription({ tenantUuid: tenant.uuid, planUuid: plan.uuid, interval: "MONTHLY" });

    const store = async (label: string) => {
        const s = await prisma.store.create({
            data: { tenantUuid: tenant.uuid, name: `Ops ${label}`, slug: `ops-${label.toLowerCase()}-${runId}`, city: "Mogadishu" },
        });
        await prisma.storeOpeningHour.createMany({
            data: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
                tenantUuid: tenant.uuid, storeUuid: s.uuid, dayOfWeek: day as any, periods: [], is24Hours: true,
            })),
        });
        return s;
    };
    return { owner, tenant, store1: await store("S1"), store2: await store("S2") };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

async function staff(ctx: Ctx, name: string, stores: string[], role: "CASHIER" | "MANAGER" = "CASHIER", pin?: string) {
    const user = await prisma.user.create({
        data: { phoneNumber: phone(), firstName: name, lastName: "Ops", ...(pin && { pinHash: await bcrypt.hash(pin, 10) }) },
    });
    const member = await prisma.tenantUser.create({
        data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, slug: `ops-${name.toLowerCase()}-${runId}-${seq++}`, payRate: 2000 },
    });
    for (const storeUuid of stores) {
        await prisma.userStore.create({
            data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, tenantUserUuid: member.uuid, storeUuid, role, canOpenDrawer: true },
        });
    }
    return user;
}

async function order(ctx: Ctx, storeUuid: string, customerUuid: string, total = 500) {
    const member = await prisma.tenantUser.findFirstOrThrow({ where: { tenantUuid: ctx.tenant.uuid, userUuid: customerUuid } });
    return prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid, tenantUserUuid: member.uuid,
            orderNumber: `OPS-${runId}-${seq++}`, subtotal: total, totalAmount: total, menuVersion: 1, pricingSnapshot: {},
        },
    });
}

const payCash = (ctx: Ctx, orderUuid: string, terminalId: string, by: string, amount = 500) => CashierPaymentService.processPayment({
    orderUuid, tenantUuid: ctx.tenant.uuid, paymentMethod: "CASH", amount, amountTendered: amount, changeGiven: 0,
    processedBy: by, deviceId: "ops-test", terminalId, idempotencyKey: crypto.randomUUID(),
});

async function payroll(ctx: Ctx) {
    console.log("\n1. Payroll");
    const worker = await staff(ctx, "Worker", [ctx.store1.uuid, ctx.store2.uuid]);

    // 4h on the clock with a 30-min UNPAID break and a 15-min PAID break
    const entry = await prisma.timeEntry.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, userUuid: worker.uuid, clockInAt: new Date(Date.now() - 4 * 3_600_000), clockInDevice: "test", payRate: 2000 },
    });
    await prisma.breakEntry.create({ data: { timeEntryUuid: entry.uuid, breakType: "UNPAID", breakStart: new Date(Date.now() - 3 * 3_600_000), breakEnd: new Date(Date.now() - 2.5 * 3_600_000) } });
    await prisma.breakEntry.create({ data: { timeEntryUuid: entry.uuid, breakType: "PAID", breakStart: new Date(Date.now() - 2 * 3_600_000), breakEnd: new Date(Date.now() - 1.75 * 3_600_000) } });

    check("clocked in at S1, clock in at S2", await settle(TimeEntryService.clockIn({ userUuid: worker.uuid, storeUuid: ctx.store2.uuid, deviceId: "t" })), "ALREADY_CLOCKED_IN_ELSEWHERE");

    const out = await TimeEntryService.clockOut({ userUuid: worker.uuid, storeUuid: ctx.store1.uuid, deviceId: "t" });
    check("paid hours: 4h - 30m unpaid break", out.hoursWorked, 3.5);
    check("pay: 3.5h x 20.00", out.totalPay, 7000);
    check("all break time recorded", out.breakMinutes, 45);
    check("break on a clocked-out entry", await settle(TimeEntryService.startBreak({ timeEntryUuid: entry.uuid, breakType: "UNPAID", userUuid: worker.uuid })), "NOT_CLOCKED_IN");

    // Five simultaneous clock-ins across both stores: one wins
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
        settle(TimeEntryService.clockIn({ userUuid: worker.uuid, storeUuid: i % 2 ? ctx.store1.uuid : ctx.store2.uuid, deviceId: "t" }))));
    console.log(`    5 concurrent clock-ins: ${tally(results)}`);
    check("  open entries afterwards", await prisma.timeEntry.count({ where: { userUuid: worker.uuid, clockOutAt: null } }), 1);
    const open = await prisma.timeEntry.findFirstOrThrow({ where: { userUuid: worker.uuid, clockOutAt: null } });
    await TimeEntryService.clockOut({ userUuid: worker.uuid, storeUuid: open.storeUuid, deviceId: "t" });

    const colleague = await staff(ctx, "Colleague", [ctx.store1.uuid]);
    const theirShift = await prisma.shift.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, userUuid: colleague.uuid, role: "CASHIER", scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3_600_000) },
    });
    check("clock in on a colleague's shift", await settle(TimeEntryService.clockIn({ userUuid: worker.uuid, storeUuid: ctx.store1.uuid, deviceId: "t", shiftUuid: theirShift.uuid })), "SHIFT_NOT_FOUND");
    const ownShiftElsewhere = await prisma.shift.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store2.uuid, userUuid: worker.uuid, role: "CASHIER", scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3_600_000) },
    });
    check("own shift, but at the other store", await settle(TimeEntryService.clockIn({ userUuid: worker.uuid, storeUuid: ctx.store1.uuid, deviceId: "t", shiftUuid: ownShiftElsewhere.uuid })), "SHIFT_NOT_FOUND");
    check("  colleague's shift untouched", (await prisma.shift.findUniqueOrThrow({ where: { uuid: theirShift.uuid } })).status, "SCHEDULED");

    // Payroll: one approved 3h entry, one 5h entry awaiting approval
    const payee = await staff(ctx, "Payee", [ctx.store1.uuid]);
    const day = new Date(Date.now() - 2 * 86_400_000);
    const mk = (hours: number, requiresApproval: boolean) => prisma.timeEntry.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, userUuid: payee.uuid, clockInDevice: "t", payRate: 2000,
            clockInAt: day, clockOutAt: new Date(day.getTime() + hours * 3_600_000), hoursWorked: hours, totalPay: hours * 2000, requiresApproval,
        },
    });
    await mk(3, false);
    const pending = await mk(5, true);
    const period = { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, periodStart: new Date(day.getTime() - 3_600_000), periodEnd: new Date(day.getTime() + 86_400_000) };
    // Only this run's payee is in the window? Other staff entries this run are today, outside it.
    const first = await PayrollExportService.calculatePayrollPeriod(period);
    check("payroll: approved hours only", first.totalHours, 3);
    check("  ...entries awaiting approval reported", first.pendingApprovalEntries, 1);
    await TimeEntryService.approveTimeEntry({ tenantUuid: ctx.tenant.uuid, timeEntryUuid: pending.uuid, approvedBy: ctx.owner.uuid });
    const second = await PayrollExportService.calculatePayrollPeriod(period);
    check("  ...after approval, recalculated", second.totalHours, 8);
}

async function drawers(ctx: Ctx) {
    console.log("\n2. Drawers");
    const cashier = await staff(ctx, "Drawer", [ctx.store1.uuid]);
    const other = await staff(ctx, "Other", [ctx.store1.uuid]);
    const open = (userUuid: string, terminalId?: string) => CashDrawerService.openDrawer({
        tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, userUuid, startingCash: 10_000, terminalId, openedBy: userUuid,
    });

    check("no terminal", await settle(open(cashier.uuid)), "TERMINAL_REQUIRED");
    const opens = await Promise.all(Array.from({ length: 5 }, () => settle(open(cashier.uuid, `T1-${runId}`))));
    console.log(`    5 concurrent opens: ${tally(opens)}`);
    check("  open drawers for the cashier", await prisma.cashDrawer.count({ where: { userUuid: cashier.uuid, status: "OPEN" } }), 1);
    check("someone else on the same terminal", await settle(open(other.uuid, `T1-${runId}`)), "TERMINAL_DRAWER_ALREADY_OPEN");
    await prisma.userStore.updateMany({ where: { userUuid: other.uuid }, data: { isActive: false } });
    check("revoked assignment, free terminal", await settle(open(other.uuid, `T2-${runId}`)), "NO_PERMISSION_OPEN_DRAWER");

    // Payments racing a close, 4 rounds
    const customer = await staff(ctx, "Customer", []);
    let misfiled = 0;
    let miscounted = 0;
    const outcomes: string[] = [];
    for (let round = 0; round < 4; round++) {
        const terminal = `RACE-${runId}-${round}`;
        const drawer = await open(cashier.uuid, terminal).catch(async () => {
            const d = await prisma.cashDrawer.findFirstOrThrow({ where: { userUuid: cashier.uuid, status: "OPEN" } });
            await CashDrawerService.closeDrawer({ tenantUuid: ctx.tenant.uuid, drawerUuid: d.uuid, actualCash: 0, closedBy: cashier.uuid, actorIsSupervisor: true });
            return open(cashier.uuid, terminal);
        });
        const orders = await Promise.all(Array.from({ length: 6 }, () => order(ctx, ctx.store1.uuid, customer.uuid)));
        // Payments spread out, the close fired partway through, so some
        // payments land before it and some arrive while/after it runs
        const later = <T>(ms: number, run: () => Promise<T>) => new Promise<T>((r) => setTimeout(() => r(run()), ms));
        const raced = await Promise.all([
            ...orders.map((o, i) => later(i * 15, () => settle(payCash(ctx, o.uuid, terminal, cashier.uuid)))),
            later(30 + round * 15, () => settle(CashDrawerService.closeDrawer({ tenantUuid: ctx.tenant.uuid, drawerUuid: drawer.uuid, actualCash: 0, closedBy: cashier.uuid, actorIsSupervisor: true }))),
        ]);
        outcomes.push(...raced.slice(0, -1).map((r) => `payment ${r}`));
        const closed = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: drawer.uuid } });
        const linked = await prisma.payment.findMany({ where: { drawerUuid: drawer.uuid } });
        if (linked.some((p) => closed.closedAt && p.createdAt > closed.closedAt)) misfiled++;
        if (linked.reduce((s, p) => s + p.amount, 0) !== (closed.cashSales ?? 0)) miscounted++;
    }
    console.log(`    payments racing 4 closes: ${tally(outcomes)}`);
    check("payments landing on a drawer after its close", misfiled, 0);
    check("closes whose count misses linked payments", miscounted, 0);
}

async function cashRefunds(ctx: Ctx) {
    console.log("\n3. Cash refunds");
    const cashier = await staff(ctx, "Refunder", [ctx.store2.uuid]);
    const customer = await staff(ctx, "RefundCustomer", []);
    const open = (terminalId: string, startingCash: number) => CashDrawerService.openDrawer({
        tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store2.uuid, userUuid: cashier.uuid, startingCash, terminalId, openedBy: cashier.uuid,
    });

    // Yesterday's drawer took the 800 sale and closed
    const d1 = await open(`D1-${runId}`, 1000);
    const o = await order(ctx, ctx.store2.uuid, customer.uuid, 800);
    const payment = await payCash(ctx, o.uuid, `D1-${runId}`, cashier.uuid, 800);
    await CashDrawerService.closeDrawer({ tenantUuid: ctx.tenant.uuid, drawerUuid: d1.uuid, actualCash: 1800, closedBy: cashier.uuid, actorIsSupervisor: false });

    const refund = await RefundService.requestRefund({ orderUuid: o.uuid, amount: 300, reason: "Cold coffee", requestedBy: cashier.uuid });
    check("cash refund requested", `${refund.status} ${refund.provider}`, "REQUESTED CASH");
    await RefundService.processRefund(refund.uuid);
    check("provider processor leaves it alone", (await prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } })).status, "REQUESTED");

    const pay = (drawerUuid: string) => RefundService.payCashRefund({
        tenantUuid: ctx.tenant.uuid, refundUuid: refund.uuid, drawerUuid, paidBy: cashier.uuid, actorIsSupervisor: false,
    });
    check("paying out of the closed drawer", await settle(pay(d1.uuid)), "NO_OPEN_DRAWER");

    const lean = await open(`D2-${runId}`, 100);
    check("drawer holding less than the refund", await settle(pay(lean.uuid)), "INSUFFICIENT_DRAWER_CASH");
    await CashDrawerService.closeDrawer({ tenantUuid: ctx.tenant.uuid, drawerUuid: lean.uuid, actualCash: 100, closedBy: cashier.uuid, actorIsSupervisor: false });

    // Today's drawer pays it, three tries at once
    const d3 = await open(`D3-${runId}`, 1000);
    const tries = await Promise.all(Array.from({ length: 3 }, () => settle(pay(d3.uuid))));
    console.log(`    3 concurrent payouts: ${tally(tries)}`);
    check("  paid once", tries.filter((t) => t === "ok").length, 1);
    const paid = await prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    check("refund completed from today's drawer", `${paid.status} ${paid.cashDrawerUuid === d3.uuid}`, "COMPLETED true");
    check("payment partially refunded", (await prisma.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } })).status, "PARTIALLY_REFUNDED");

    const totals = async (uuid: string) => CashDrawerService.expectedTotals(prisma as any, await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid }, include: { cashDrops: true } }));
    check("today's drawer: 1000 - 300 refund", (await totals(d3.uuid)).expectedCash, 700);
    check("yesterday's drawer still 1000 + 800 sale", (await totals(d1.uuid)).expectedCash, 1800);
}

async function shutdown(ctx: Ctx) {
    console.log("\n4. Store shutdown");
    const pin = String(crypto.randomInt(1000, 9999));
    const cashier = await staff(ctx, "Shut", [ctx.store1.uuid], "CASHIER", pin);
    const customer = await staff(ctx, "ShutCustomer", []);
    const product = await prisma.product.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, name: `Latte ${runId}`, basePrice: 300,
            categoryUuid: (await prisma.category.create({ data: { tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, name: "Main", slug: `main-${runId}` } })).uuid,
        },
    });
    const customerMember = await prisma.tenantUser.findFirstOrThrow({ where: { tenantUuid: ctx.tenant.uuid, userUuid: customer.uuid } });

    check("socket store room while open", await canJoinDashboardRoom({ userUuid: cashier.uuid, isSuperAdmin: false }, `store:${ctx.store1.uuid}`), true);
    await prisma.store.update({ where: { uuid: ctx.store1.uuid }, data: { active: false } });

    check("new order", await settle(OrderCommandService.createOrder({
        tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, tenantUserUuid: customerMember.uuid, orderType: "TAKEAWAY", items: [{ productUuid: product.uuid, quantity: 1 }],
    })), "STORE_CLOSED");
    check("clock-in", await settle(TimeEntryService.clockIn({ userUuid: cashier.uuid, storeUuid: ctx.store1.uuid, deviceId: "t" })), "STORE_INACTIVE");
    check("PIN login", await settle(StaffManagementService.authenticateWithPIN({ pin, storeUuid: ctx.store1.uuid, deviceId: "t" })), "STORE_INACTIVE");
    check("open a drawer", await settle(CashDrawerService.openDrawer({
        tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store1.uuid, userUuid: cashier.uuid, startingCash: 0, terminalId: `SHUT-${runId}`, openedBy: cashier.uuid,
    })), "STORE_INACTIVE");
    const now = new Date().toISOString();
    check("offline order sync", await settle(OrderSyncService.syncFromClient({
        tenantUuid: ctx.tenant.uuid, tenantUserUuid: (await prisma.tenantUser.findFirstOrThrow({ where: { userUuid: cashier.uuid } })).uuid, userUuid: cashier.uuid, deviceId: "t",
        clientOrder: { clientOrderUuid: crypto.randomUUID(), storeUuid: ctx.store1.uuid, orderType: "TAKEAWAY", items: [{ productUuid: product.uuid, quantity: 1 }], status: "PENDING", createdAt: now, lastModifiedAt: now } as any,
    })), "STORE_INACTIVE");
    check("socket store room", await canJoinDashboardRoom({ userUuid: cashier.uuid, isSuperAdmin: false }, `store:${ctx.store1.uuid}`), false);
    check("  ...super admin still can", await canJoinDashboardRoom({ userUuid: crypto.randomUUID(), isSuperAdmin: true }, `store:${ctx.store1.uuid}`), true);

    await prisma.store.update({ where: { uuid: ctx.store1.uuid }, data: { active: true } });
    await prisma.tenant.update({ where: { uuid: ctx.tenant.uuid }, data: { status: "SUSPENDED" } });
    check("suspended tenant: clock-in", await settle(TimeEntryService.clockIn({ userUuid: cashier.uuid, storeUuid: ctx.store1.uuid, deviceId: "t" })), "STORE_INACTIVE");
    check("suspended tenant: tenant room", await canJoinDashboardRoom({ userUuid: ctx.owner.uuid, isSuperAdmin: false }, `tenant:${ctx.tenant.uuid}`), false);
    await prisma.tenant.update({ where: { uuid: ctx.tenant.uuid }, data: { status: "ACTIVE" } });
}

async function reconcile(ctx: Ctx) {
    console.log("\n5. Reconciling an auto-closed drawer");
    const leaver = await staff(ctx, "Leaver", [ctx.store2.uuid]);
    const manager = await staff(ctx, "Counter", [ctx.store2.uuid], "MANAGER");
    const drawer = await CashDrawerService.openDrawer({
        tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store2.uuid, userUuid: leaver.uuid, startingCash: 5000, terminalId: `AUTO-${runId}`, openedBy: leaver.uuid,
    });
    await prisma.$transaction((tx) => CashDrawerService.autoClose(tx, { tenantUuid: ctx.tenant.uuid, drawerUuid: drawer.uuid, closedBy: manager.uuid, reason: "test" }));
    const approve = (by: string, actualCash?: number) => CashDrawerService.approveCashVariance({ tenantUuid: ctx.tenant.uuid, drawerUuid: drawer.uuid, approvedBy: by, actualCash });

    check("sign off without a count", await settle(approve(manager.uuid)), "COUNT_REQUIRED");
    check("owner counts their own drawer", await settle(approve(leaver.uuid, 4800)), "VARIANCE_SELF_APPROVE");
    check("manager counts 4800", await settle(approve(manager.uuid, 4800)), "ok");
    const closed = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: drawer.uuid } });
    check("  ...closed with the count and variance", `${closed.status} ${closed.actualCash} ${closed.variance}`, "CLOSED 4800 -200");
    check("  ...count recorded", await prisma.cashCount.count({ where: { cashDrawerUuid: drawer.uuid, countType: "CLOSE" } }), 1);
    const request = await prisma.staffApprovalRequest.findFirst({ where: { approvalType: "CASH_VARIANCE", requestData: { path: ["drawerUuid"], equals: drawer.uuid } } });
    check("  ...approval request resolved", request?.status, "APPROVED");
    check("sign off again", await settle(approve(manager.uuid, 4800)), "DRAWER_NOT_RECONCILING");
}

let exitCode = 0;
try {
    const ctx = await setup();
    console.log(`Run ${runId}`);
    await payroll(ctx);
    await drawers(ctx);
    await cashRefunds(ctx);
    await shutdown(ctx);
    await reconcile(ctx);
    console.log(failures === 0 ? "\nAll operations checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nOperations test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
