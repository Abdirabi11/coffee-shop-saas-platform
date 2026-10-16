// LOCAL RBAC & TENANT ISOLATION CHECKS
// Mounts the real store, order and cashier routers in a throwaway Express app,
// calls them over HTTP with real signed access tokens, and checks the status
// codes. Every run creates two fresh tenants:
//
//   Tenant A: owner (global ADMIN, TENANT_ADMIN), stores A1 and A2,
//             manager and cashier at A1 (global CUSTOMER, like invited staff),
//             two customers
//   Tenant B: its own owner and store B1; tenant A's owner is also a plain
//             customer member of B
//   Phase 23 additions in tenant A: a non-owner store ADMIN and a
//   STORE_MANAGER at A1 (the latter with an explicit staff.update grant), two
//   non-owner TENANT_ADMINs, and plain members to act on
//
// Covers: roles come from the tenant/store membership, not the token's
// global role; stores and resources from another tenant are invisible;
// cashier and order access is checked at the order's own store; customers
// only reach their own orders; store roles never satisfy tenant-wide routes
// (even with ?storeUuid=); roles can only be assigned below the caller's own,
// never to yourself, never over a peer or superior; menu admin writes and
// staff profiles never cross tenants or stores, and profiles carry no secrets;
// cash drawers are acted on only at their own store, by their owner or a
// supervisor, closed exactly once, counted per drawer with only verified drops;
// employees clock and break only themselves.
//
//   npx tsx scripts/test-rbac.ts
//
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// Rate limiters call Redis on every request
const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: express } = await import("express");
const { default: prisma } = await import("../src/config/prisma.ts");
const { signAccessToken } = await import("../src/utils/jwt.ts");
const { default: storeRoutes } = await import("../src/routes/store/store.routes.ts");
const { default: orderRoutes } = await import("../src/routes/order/order.routes.ts");
const { default: cashierRoutes } = await import("../src/routes/payment/CashierPayment.routes.ts");
const { default: tenantRoutes } = await import("../src/routes/tenant/tenant.routes.ts");
const { default: staffRoutes } = await import("../src/routes/staff/staff.routes.ts");
const { default: financialRoutes } = await import("../src/routes/payment/Financial.routes.ts");
const { default: menuAdminRoutes } = await import("../src/routes/menu/menuAdmin.routes.ts");
const { default: webhookAdminRoutes } = await import("../src/routes/webhooks/webhookAdmin.routes.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let phoneSeq = 0;

async function user(name: string, globalRole: "SUPER_ADMIN" | "ADMIN" | "CUSTOMER") {
    const phoneNumber = `+1999${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, "0")}`;
    return prisma.user.create({ data: { phoneNumber, firstName: name, lastName: "RBAC", globalRole } });
}

async function tenant(label: string, ownerUuid: string) {
    return prisma.tenant.create({
        data: { name: `RBAC ${label} ${runId}`, slug: `rbac-${label.toLowerCase()}-${runId}`, email: `${label}@rbac.test`, ownerUuid },
    });
}

async function member(tenantUuid: string, userUuid: string, role: "TENANT_ADMIN" | "REGIONAL_MANAGER" | "STAFF", slug: string) {
    return prisma.tenantUser.create({ data: { tenantUuid, userUuid, role, slug: `${slug}-${runId}` } });
}

async function store(tenantUuid: string, label: string) {
    return prisma.store.create({
        data: { tenantUuid, name: `RBAC ${label} ${runId}`, slug: `rbac-${label.toLowerCase()}-${runId}`, city: "Mogadishu" },
    });
}

async function assign(userUuid: string, tenantUserUuid: string, tenantUuid: string, storeUuid: string, role: "ADMIN" | "MANAGER" | "STORE_MANAGER" | "CASHIER") {
    return prisma.userStore.create({ data: { userUuid, tenantUserUuid, tenantUuid, storeUuid, role } });
}

let orderSeq = 0;
async function order(tenantUuid: string, storeUuid: string, tenantUserUuid: string) {
    return prisma.order.create({
        data: {
            tenantUuid, storeUuid, tenantUserUuid,
            orderNumber: `RBAC-${runId}-${orderSeq++}`,
            status: "PENDING", paymentStatus: "PENDING", currency: "USD",
            subtotal: 400, totalAmount: 400, menuVersion: 1,
            pricingSnapshot: { items: [], calculations: { subtotal: 400, total: 400 } },
        },
    });
}

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    // Owners get global ADMIN, as the seed does; staff and customers get
    // global CUSTOMER, as TenantInvitation does
    const ownerA = await user("OwnerA", "ADMIN");
    const ownerB = await user("OwnerB", "ADMIN");
    const managerA = await user("ManagerA", "CUSTOMER");
    const cashierA = await user("CashierA", "CUSTOMER");
    const customerA = await user("CustomerA", "CUSTOMER");
    const customerA2 = await user("CustomerA2", "CUSTOMER");

    const tA = await tenant("A", ownerA.uuid);
    const tB = await tenant("B", ownerB.uuid);

    const ownerA_A = await member(tA.uuid, ownerA.uuid, "TENANT_ADMIN", "owner-a");
    const ownerB_B = await member(tB.uuid, ownerB.uuid, "TENANT_ADMIN", "owner-b");
    const ownerA_B = await member(tB.uuid, ownerA.uuid, "STAFF", "owner-a-as-customer"); // A's owner shops at B
    const managerA_A = await member(tA.uuid, managerA.uuid, "STAFF", "manager-a");
    const cashierA_A = await member(tA.uuid, cashierA.uuid, "STAFF", "cashier-a");
    const customerA_A = await member(tA.uuid, customerA.uuid, "STAFF", "customer-a");
    const customerA2_A = await member(tA.uuid, customerA2.uuid, "STAFF", "customer-a2");

    const a1 = await store(tA.uuid, "A1");
    const a2 = await store(tA.uuid, "A2");
    const b1 = await store(tB.uuid, "B1");

    await assign(ownerA.uuid, ownerA_A.uuid, tA.uuid, a1.uuid, "ADMIN");
    await assign(ownerB.uuid, ownerB_B.uuid, tB.uuid, b1.uuid, "ADMIN");
    await assign(managerA.uuid, managerA_A.uuid, tA.uuid, a1.uuid, "MANAGER");
    const cashierA1 = await assign(cashierA.uuid, cashierA_A.uuid, tA.uuid, a1.uuid, "CASHIER");
    await prisma.userStore.update({ where: { uuid: cashierA1.uuid }, data: { canOpenDrawer: true } });

    // Phase 23: escalation and hierarchy actors
    const storeAdminA = await user("StoreAdminA", "CUSTOMER");
    const storeMgrA = await user("StoreMgrA", "CUSTOMER");
    const adminA2 = await user("TenantAdminA2", "CUSTOMER");
    const adminA3 = await user("TenantAdminA3", "CUSTOMER");
    const newbie = await user("NewbieA", "CUSTOMER");
    const promotee = await user("PromoteeA", "CUSTOMER");
    const storeAdminA_A = await member(tA.uuid, storeAdminA.uuid, "STAFF", "store-admin-a");
    const storeMgrA_A = await member(tA.uuid, storeMgrA.uuid, "STAFF", "store-mgr-a");
    const adminA2_A = await member(tA.uuid, adminA2.uuid, "TENANT_ADMIN", "admin-a2");
    const adminA3_A = await member(tA.uuid, adminA3.uuid, "TENANT_ADMIN", "admin-a3");
    const newbie_A = await member(tA.uuid, newbie.uuid, "STAFF", "newbie-a");
    const promotee_A = await member(tA.uuid, promotee.uuid, "STAFF", "promotee-a");
    await assign(storeAdminA.uuid, storeAdminA_A.uuid, tA.uuid, a1.uuid, "ADMIN");
    await assign(storeMgrA.uuid, storeMgrA_A.uuid, tA.uuid, a1.uuid, "STORE_MANAGER");
    // staff.update isn't in any default role; grant it so the profile-edit
    // checks below are reached
    const staffUpdate = await prisma.permission.upsert({
        where: { slug: "staff.update" },
        update: {},
        create: { slug: "staff.update", resource: "staff", action: "update", name: "Update Staff" },
    });
    await prisma.userPermission.create({
        data: { userUuid: storeMgrA.uuid, storeUuid: a1.uuid, permissionUuid: staffUpdate.uuid, grantedBy: ownerA.uuid },
    });
    // Menu admin permissions aren't in any default role either: grant them at A1
    for (const action of ["read", "create", "update", "delete"]) {
        const perm = await prisma.permission.upsert({
            where: { slug: `menu.${action}` },
            update: {},
            create: { slug: `menu.${action}`, resource: "menu", action, name: `Menu ${action}` },
        });
        await prisma.userPermission.create({
            data: { userUuid: storeMgrA.uuid, storeUuid: a1.uuid, permissionUuid: perm.uuid, grantedBy: ownerA.uuid },
        });
    }
    // Phase 26: staff record permissions aren't in any default role (the
    // defaults use shift.manage): grant them to the A1 manager at A1 only
    for (const slug of ["shift.update", "shift.cancel", "time_entry.read"]) {
        const [resource, action] = slug.split(".");
        const perm = await prisma.permission.upsert({
            where: { slug },
            update: {},
            create: { slug, resource, action, name: slug },
        });
        await prisma.userPermission.create({
            data: { userUuid: managerA.uuid, storeUuid: a1.uuid, permissionUuid: perm.uuid, grantedBy: ownerA.uuid },
        });
    }
    const supervisorA = await user("SupervisorA", "CUSTOMER");
    const supervisorA_A = await member(tA.uuid, supervisorA.uuid, "STAFF", "supervisor-a");
    await prisma.userStore.create({
        data: { userUuid: supervisorA.uuid, tenantUserUuid: supervisorA_A.uuid, tenantUuid: tA.uuid, storeUuid: a1.uuid, role: "SHIFT_SUPERVISOR" },
    });

    // A secret to look for in profile responses
    await prisma.user.update({ where: { uuid: cashierA.uuid }, data: { pinHash: "$2b$10$test-pin-hash-should-never-leak", otpCode: "123456" } });

    // Menu fixtures: a category + product per store, option groups at A1 and B1
    const menu: Record<string, { category: string; product: string; group?: string }> = {};
    for (const [key, st] of [["a1", a1], ["a2", a2], ["b1", b1]] as const) {
        const category = await prisma.category.create({
            data: { tenantUuid: st.tenantUuid, storeUuid: st.uuid, name: `Cat ${key}`, slug: `cat-${key}` },
        });
        const product = await prisma.product.create({
            data: { tenantUuid: st.tenantUuid, storeUuid: st.uuid, categoryUuid: category.uuid, name: `Prod ${key}`, basePrice: 500 },
        });
        menu[key] = { category: category.uuid, product: product.uuid };
    }
    for (const [key, st] of [["a1", a1], ["b1", b1]] as const) {
        const group = await prisma.optionGroup.create({ data: { tenantUuid: st.tenantUuid, storeUuid: st.uuid, name: `Group ${key}` } });
        menu[key].group = group.uuid;
    }

    // A drawer in tenant B, to try from tenant A
    const drawerB = await prisma.cashDrawer.create({
        data: { tenantUuid: tB.uuid, storeUuid: b1.uuid, userUuid: ownerB.uuid, status: "OPEN", openedAt: new Date(), startingCash: 5000 },
    });

    const exceptionB = await prisma.storeHourException.create({
        data: { tenantUuid: tB.uuid, storeUuid: b1.uuid, exceptionDate: new Date("2030-01-01"), exceptionType: "HOLIDAY", name: "B holiday" },
    });

    const orders = {
        a1Customer: await order(tA.uuid, a1.uuid, customerA_A.uuid),
        a1Customer2: await order(tA.uuid, a1.uuid, customerA2_A.uuid),
        a1ForCashier: await order(tA.uuid, a1.uuid, customerA_A.uuid),
        a2Order: await order(tA.uuid, a2.uuid, customerA_A.uuid),
        a1DrawerSale: await order(tA.uuid, a1.uuid, customerA_A.uuid),
        a1OtherTerminalSale: await order(tA.uuid, a1.uuid, customerA_A.uuid),
        b1Order: await order(tB.uuid, b1.uuid, ownerB_B.uuid),
    };

    // Phase 26 staff records: shifts, time entries, reconciling drawers, approval requests
    const shiftAt = (st: { uuid: string; tenantUuid: string }, userUuid: string) => prisma.shift.create({
        data: {
            tenantUuid: st.tenantUuid, storeUuid: st.uuid, userUuid, role: "CASHIER",
            scheduledStart: new Date("2030-02-01T08:00:00Z"), scheduledEnd: new Date("2030-02-01T16:00:00Z"),
        },
    });
    const entryAt = (st: { uuid: string; tenantUuid: string }, userUuid: string, day: number) => prisma.timeEntry.create({
        data: {
            tenantUuid: st.tenantUuid, storeUuid: st.uuid, userUuid, clockInDevice: "test-device",
            clockInAt: new Date(`2030-02-0${day}T08:00:00Z`), clockOutAt: new Date(`2030-02-0${day}T16:00:00Z`),
            hoursWorked: 8, payRate: 1500, totalPay: 12000, requiresApproval: true,
        },
    });
    const reconciling = (st: { uuid: string; tenantUuid: string }, userUuid: string) => prisma.cashDrawer.create({
        data: {
            tenantUuid: st.tenantUuid, storeUuid: st.uuid, userUuid, status: "RECONCILING",
            openedAt: new Date(), closedAt: new Date(), startingCash: 10000, expectedCash: 10000, actualCash: 8000, variance: -2000,
        },
    });
    const request = (st: { uuid: string; tenantUuid: string }, requestedBy: string, approvalType: "CASH_VARIANCE" | "LATE_CLOCK_IN" | "MISSED_CLOCK_OUT", requestData: object) =>
        prisma.staffApprovalRequest.create({ data: { tenantUuid: st.tenantUuid, storeUuid: st.uuid, requestedBy, approvalType, requestData, status: "PENDING" } });

    const entries = {
        cashierA1: await entryAt(a1, cashierA.uuid, 1),
        cashierA2: await entryAt(a2, cashierA.uuid, 2),
        managerA1: await entryAt(a1, managerA.uuid, 1),
        ownerA_B1: await entryAt(b1, ownerA.uuid, 3),   // A's owner also works at tenant B
        ownerB_B1: await entryAt(b1, ownerB.uuid, 1),
    };
    const drawers = {
        varA1: await reconciling(a1, cashierA.uuid),
        varA1b: await reconciling(a1, cashierA.uuid),
        varA2: await reconciling(a2, cashierA.uuid),
        varMgr: await reconciling(a1, managerA.uuid),
        openA1: await prisma.cashDrawer.create({
            data: { tenantUuid: tA.uuid, storeUuid: a1.uuid, userUuid: storeAdminA.uuid, status: "OPEN", openedAt: new Date(), startingCash: 5000 },
        }),
    };
    const p26 = {
        shifts: { a1: await shiftAt(a1, cashierA.uuid), a1b: await shiftAt(a1, cashierA.uuid), a2: await shiftAt(a2, cashierA.uuid), b1: await shiftAt(b1, ownerB.uuid) },
        entries,
        drawers,
        requests: {
            varA1: await request(a1, cashierA.uuid, "CASH_VARIANCE", { drawerUuid: drawers.varA1.uuid }),
            varA1b: await request(a1, cashierA.uuid, "CASH_VARIANCE", { drawerUuid: drawers.varA1b.uuid }),
            varA2: await request(a2, cashierA.uuid, "CASH_VARIANCE", { drawerUuid: drawers.varA2.uuid }),
            // approvedBy in requestData is written by the requester: must be ignored
            lateA1: await request(a1, cashierA.uuid, "LATE_CLOCK_IN", { timeEntryUuid: entries.cashierA1.uuid, approvedBy: cashierA.uuid }),
            lateMgr: await request(a1, managerA.uuid, "LATE_CLOCK_IN", { timeEntryUuid: entries.managerA1.uuid }),
            missedA1: await request(a1, cashierA.uuid, "MISSED_CLOCK_OUT", {}),
            b1: await request(b1, ownerB.uuid, "MISSED_CLOCK_OUT", {}),
        },
    };

    // Phase 29: swap requests, tip pools, break violations, upcoming shifts,
    // attribution orders. The A1 manager gets shift.read at A1 only.
    const shiftRead = await prisma.permission.upsert({
        where: { slug: "shift.read" },
        update: {},
        create: { slug: "shift.read", resource: "shift", action: "read", name: "shift.read" },
    });
    await prisma.userPermission.create({
        data: { userUuid: managerA.uuid, storeUuid: a1.uuid, permissionUuid: shiftRead.uuid, grantedBy: ownerA.uuid },
    });
    const swap = (shiftUuid: string, requestedBy: string, requestedWith?: string) =>
        prisma.shiftSwapRequest.create({ data: { shiftUuid, requestedBy, requestedWith, reason: "appointment" } });
    const pool = (st: { uuid: string; tenantUuid: string }, day: number, status: "OPEN" | "CALCULATED") => prisma.tipPool.create({
        data: { tenantUuid: st.tenantUuid, storeUuid: st.uuid, periodStart: new Date(`2030-03-0${day}T00:00:00Z`), periodEnd: new Date(`2030-03-0${day}T23:59:59Z`), status },
    });
    const policyA = await prisma.breakPolicy.create({
        data: { tenantUuid: tA.uuid, name: "Meal", minShiftHours: 6, breakType: "MEAL", breakDuration: 30, isPaid: false },
    });
    const policyB = await prisma.breakPolicy.create({
        data: { tenantUuid: tB.uuid, name: "Meal", minShiftHours: 6, breakType: "MEAL", breakDuration: 30, isPaid: false },
    });
    const violation = (st: { uuid: string }, timeEntryUuid: string, userUuid: string, breakPolicyUuid = policyA.uuid) => prisma.breakViolation.create({
        data: { timeEntryUuid, userUuid, storeUuid: st.uuid, breakPolicyUuid, violationType: "MISSED_BREAK", expectedBreakAt: new Date("2030-02-01T14:00:00Z"), hoursWorked: 8 },
    });
    const soon = (st: { uuid: string; tenantUuid: string }, userUuid: string) => prisma.shift.create({
        data: {
            tenantUuid: st.tenantUuid, storeUuid: st.uuid, userUuid, role: "CASHIER",
            scheduledStart: new Date(Date.now() + 86_400_000), scheduledEnd: new Date(Date.now() + 86_400_000 + 8 * 3_600_000),
        },
    });
    const supervisorEntry = await entryAt(a1, supervisorA.uuid, 4);
    const p29 = {
        swaps: {
            a1: await swap(p26.shifts.a1.uuid, cashierA.uuid),
            a1WithSupervisor: await swap(p26.shifts.a1.uuid, cashierA.uuid, supervisorA.uuid),
            a2: await swap(p26.shifts.a2.uuid, cashierA.uuid),
            b1: await swap(p26.shifts.b1.uuid, ownerB.uuid),
        },
        pools: { a1: await pool(a1, 1, "CALCULATED"), a1Open: await pool(a1, 2, "OPEN"), a2: await pool(a2, 1, "CALCULATED"), b1: await pool(b1, 1, "CALCULATED") },
        violations: {
            a1: await violation(a1, entries.cashierA1.uuid, cashierA.uuid),
            a1b: await violation(a1, entries.cashierA1.uuid, cashierA.uuid),
            a2: await violation(a2, entries.cashierA2.uuid, cashierA.uuid),
            supervisorOwn: await violation(a1, supervisorEntry.uuid, supervisorA.uuid),
            b1: await violation(b1, entries.ownerB_B1.uuid, ownerB.uuid, policyB.uuid),
        },
        upcoming: { a1: await soon(a1, cashierA.uuid), a2: await soon(a2, cashierA.uuid) },
        orders: {
            a1: await order(tA.uuid, a1.uuid, customerA_A.uuid),
            a1b: await order(tA.uuid, a1.uuid, customerA_A.uuid),
            a2: await order(tA.uuid, a2.uuid, customerA_A.uuid),
            b1: await order(tB.uuid, b1.uuid, ownerB_B.uuid),
        },
    };

    // Phase 30: a platform super admin, and stored Stripe events to replay.
    // "customer.created" isn't a handled type: replaying it is IGNORED, no side effects.
    const superAdmin = await user("SuperAdmin", "SUPER_ADMIN");
    const stripeEvent = (id: string, status: "PROCESSED" | "PROCESSING") => {
        const payload = { id, type: "customer.created", data: { object: {} } };
        return prisma.webhookEvent.create({
            data: {
                provider: "STRIPE", providerEventId: id, providerEventUuid: id, eventUuid: id, eventType: payload.type,
                sourceIp: "127.0.0.1", payload, payloadSize: JSON.stringify(payload).length, status,
            },
        });
    };
    const p30 = {
        events: {
            done: await stripeEvent(`evt_rbac_done_${runId}`, "PROCESSED"),
            busy: await stripeEvent(`evt_rbac_busy_${runId}`, "PROCESSING"),
        },
    };

    // Tokens carry the global role and login tenant, exactly as TokenService issues them
    const token = (u: { uuid: string; globalRole: string; tokenVersion: number }, tenantUuid: string) =>
        signAccessToken({ userUuid: u.uuid, role: u.globalRole as any, tenantUuid, tokenVersion: u.tokenVersion });

    return {
        tA, tB, a1, a2, b1, exceptionB, orders, drawerB, p26, p29, p30,
        users: { ownerA, ownerB, storeAdminA, storeMgrA, newbie, cashierA, managerA, supervisorA, customerA },
        menu,
        members: { ownerA_A, storeAdminA_A, adminA2_A, adminA3_A, newbie_A, promotee_A },
        tokens: {
            ownerA: token(ownerA, tA.uuid),
            managerA: token(managerA, tA.uuid),
            cashierA: token(cashierA, tA.uuid),
            customerA: token(customerA, tA.uuid),
            storeAdminA: token(storeAdminA, tA.uuid),
            storeMgrA: token(storeMgrA, tA.uuid),
            adminA2: token(adminA2, tA.uuid),
            newbie: token(newbie, tA.uuid),
            supervisorA: token(supervisorA, tA.uuid),
            superAdmin: token(superAdmin, tA.uuid),
        },
    };
}

async function main() {
    const ctx = await setup();

    const app = express();
    app.use(express.json());
    app.use("/api/store", storeRoutes);
    app.use("/api/order", orderRoutes);
    app.use("/api/cashier", cashierRoutes);
    app.use("/api/tenant", tenantRoutes);
    app.use("/api/staff", staffRoutes);
    app.use("/api/financial", financialRoutes);
    app.use("/api/admin/menu", menuAdminRoutes);
    app.use("/api/admin/webhooks", webhookAdminRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const call = async (method: string, path: string, token: string, opts: { body?: unknown; tenant?: string } = {}) => {
        const res = await fetch(base + path, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
                ...(opts.tenant ? { "x-tenant-uuid": opts.tenant } : {}),
            },
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    };
    const status = async (...args: Parameters<typeof call>) => (await call(...args)).status;
    const { tokens: t, orders: o } = ctx;
    const schedule = { schedule: [{ dayOfWeek: "MONDAY", openTime: "08:00", closeTime: "18:00" }] };

    try {
        console.log("RBAC & tenant isolation checks");
        console.log(`  tenant A: ${ctx.tA.uuid}   tenant B: ${ctx.tB.uuid}`);

        console.log("\n=== Cross-tenant (finding #1) ===");
        check("A's owner, switched into B where they're a customer, sets B1 hours",
            await status("PUT", `/api/store/${ctx.b1.uuid}/hours/bulk`, t.ownerA, { tenant: ctx.tB.uuid, body: schedule }), 403);
        check("A's owner in A context sets B1 hours (store not in tenant)",
            await status("PUT", `/api/store/${ctx.b1.uuid}/hours/bulk`, t.ownerA, { body: schedule }), 404);
        check("A's owner reads B1 active orders",
            await status("GET", `/api/store/${ctx.b1.uuid}/orders/active`, t.ownerA), 404);
        check("A's owner deletes B's holiday via their own store A1",
            await status("DELETE", `/api/store/${ctx.a1.uuid}/hours/exceptions/${ctx.exceptionB.uuid}`, t.ownerA), 404);
        const exceptionB = await prisma.storeHourException.findUniqueOrThrow({ where: { uuid: ctx.exceptionB.uuid } });
        check("B's holiday still active", exceptionB.isActive, true);
        check("A's owner sets their own A1 hours", await status("PUT", `/api/store/${ctx.a1.uuid}/hours/bulk`, t.ownerA, { body: schedule }), 200);
        const b1Hours = await prisma.storeOpeningHour.count({ where: { storeUuid: ctx.b1.uuid } });
        check("opening-hour rows written for B1", b1Hours, 0);

        console.log("\n=== Roles from membership, not the token's global role ===");
        check("A1 manager (global CUSTOMER) reads A1 active orders",
            await status("GET", `/api/store/${ctx.a1.uuid}/orders/active`, t.managerA), 200);
        check("A1 manager reads A2 active orders (not assigned there)",
            await status("GET", `/api/store/${ctx.a2.uuid}/orders/active`, t.managerA), 403);
        check("A1 manager sets A1 hours (OWNER/ADMIN only)",
            await status("PUT", `/api/store/${ctx.a1.uuid}/hours/bulk`, t.managerA, { body: schedule }), 403);
        check("customer reads A1 active orders",
            await status("GET", `/api/store/${ctx.a1.uuid}/orders/active`, t.customerA), 403);

        console.log("\n=== Cashier payments at the order's own store (finding #4) ===");
        const pay = (orderUuid: string, extra: Record<string, unknown> = {}) => ({
            orderUuid, paymentMethod: "CASH", amount: 400, amountTendered: 500, changeGiven: 100, ...extra,
        });
        check("A1 cashier takes payment for an A2 order, naming A1 as storeUuid",
            await status("POST", "/api/cashier/process", t.cashierA, { body: pay(o.a2Order.uuid, { storeUuid: ctx.a1.uuid }) }), 403);
        check("A1 cashier takes payment for a tenant B order",
            await status("POST", "/api/cashier/process", t.cashierA, { body: pay(o.b1Order.uuid) }), 404);
        check("customer takes a cashier payment",
            await status("POST", "/api/cashier/process", t.customerA, { body: pay(o.a1ForCashier.uuid) }), 403);
        const paid = await call("POST", "/api/cashier/process", t.cashierA, { body: pay(o.a1ForCashier.uuid) });
        check("A1 cashier (global CUSTOMER) takes payment for an A1 order", paid.status, 201);
        const paymentUuid = paid.body?.data?.uuid;
        check("A1 cashier corrects that payment (ADMIN only)",
            await status("POST", `/api/cashier/${paymentUuid}/correct`, t.cashierA, { body: { correctAmount: 300, correctionReason: "Wrong amount keyed in" } }), 403);
        check("A's owner (store ADMIN) corrects it",
            await status("POST", `/api/cashier/${paymentUuid}/correct`, t.ownerA, { body: { correctAmount: 350, correctionReason: "Wrong amount keyed in" } }), 200);

        console.log("\n=== Orders: own orders for customers, own stores for staff ===");
        check("customer reads their own order", await status("GET", `/api/order/${o.a1Customer.uuid}`, t.customerA), 200);
        check("customer reads another customer's order", await status("GET", `/api/order/${o.a1Customer2.uuid}`, t.customerA), 403);
        check("customer reads another customer's timeline", await status("GET", `/api/order/${o.a1Customer2.uuid}/timeline`, t.customerA), 403);
        check("customer adds an item to another customer's order",
            await status("POST", `/api/order/${o.a1Customer2.uuid}/items`, t.customerA, { body: { productUuid: crypto.randomUUID(), quantity: 1 } }), 403);
        check("customer reads a tenant B order", await status("GET", `/api/order/${o.b1Order.uuid}`, t.customerA), 404);
        check("A1 cashier reads an A1 order", await status("GET", `/api/order/${o.a1Customer2.uuid}`, t.cashierA), 200);
        check("A1 cashier updates an A2 order's status",
            await status("PATCH", `/api/order/${o.a2Order.uuid}/status`, t.cashierA, { body: { status: "PREPARING" } }), 403);

        const ownList = await call("GET", `/api/order?storeUuid=${ctx.a1.uuid}`, t.customerA);
        const staffList = await call("GET", `/api/order?storeUuid=${ctx.a1.uuid}`, t.managerA);
        const uuids = (r: any) => new Set<string>((r.body?.orders ?? r.body?.data ?? r.body?.result?.orders ?? []).map((x: any) => x.uuid));
        check("customer's A1 order list excludes the other customer's order", uuids(ownList).has(o.a1Customer2.uuid), false);
        check("customer's A1 order list includes their own order", uuids(ownList).has(o.a1Customer.uuid), true);
        check("A1 manager's A1 order list includes every customer's order", uuids(staffList).has(o.a1Customer2.uuid), true);

        const { users: u, members: m } = ctx;
        const a1 = ctx.a1.uuid;
        const errorOf = async (...args: Parameters<typeof call>) => {
            const r = await call(...args);
            return `${r.status} ${r.body?.error ?? ""}`.trim();
        };

        console.log("\n=== Store roles never satisfy tenant-wide routes (Phase 23) ===");
        check("A1 manager, tenant dashboard with ?storeUuid=A1",
            await status("GET", `/api/tenant/dashboard?storeUuid=${a1}`, t.managerA), 403);
        check("A1 manager, tenant staff list (pay rates) with ?storeUuid=A1",
            await status("GET", `/api/tenant/staff?storeUuid=${a1}`, t.managerA), 403);
        check("A1 cashier, tenant dashboard with ?storeUuid=A1",
            await status("GET", `/api/tenant/dashboard?storeUuid=${a1}`, t.cashierA), 403);
        check("A1 store ADMIN, tenant staff list with ?storeUuid=A1",
            await status("GET", `/api/tenant/staff?storeUuid=${a1}`, t.storeAdminA), 403);
        check("A1 store ADMIN promotes self to TENANT_ADMIN via ?storeUuid=A1",
            await status("PATCH", `/api/tenant/staff/${m.storeAdminA_A.uuid}?storeUuid=${a1}`, t.storeAdminA, { body: { role: "TENANT_ADMIN" } }), 403);
        check("A1 store ADMIN promotes self to TENANT_ADMIN via body storeUuid",
            await status("PATCH", `/api/tenant/staff/${m.storeAdminA_A.uuid}`, t.storeAdminA, { body: { storeUuid: a1, role: "TENANT_ADMIN" } }), 403);
        const storeAdminRole = (await prisma.tenantUser.findUniqueOrThrow({ where: { uuid: m.storeAdminA_A.uuid } })).role;
        check("store ADMIN's tenant role unchanged", storeAdminRole, "STAFF");
        check("A1 manager, tenant-wide reconciliation overview with ?storeUuid=A1",
            await status("GET", `/api/financial/reconciliation/overview?storeUuid=${a1}`, t.managerA), 403);
        check("A1 manager, tenant-wide forecast with ?storeUuid=A1",
            await status("GET", `/api/financial/forecast/summary?storeUuid=${a1}`, t.managerA), 403);
        check("owner reads tenant staff list", await status("GET", "/api/tenant/staff", t.ownerA), 200);
        check("A1 manager still reads A1 active orders (store route)",
            await status("GET", `/api/store/${a1}/orders/active`, t.managerA), 200);

        console.log("\n=== Tenant role hierarchy (Phase 23) ===");
        check("tenant admin changes own role",
            await errorOf("PATCH", `/api/tenant/staff/${m.adminA2_A.uuid}`, t.adminA2, { body: { role: "STAFF" } }), "403 CANNOT_MODIFY_SELF");
        check("tenant admin demotes the owner",
            await errorOf("PATCH", `/api/tenant/staff/${m.ownerA_A.uuid}`, t.adminA2, { body: { role: "STAFF" } }), "403 TARGET_ROLE_TOO_HIGH");
        check("tenant admin demotes a peer tenant admin",
            await errorOf("PATCH", `/api/tenant/staff/${m.adminA3_A.uuid}`, t.adminA2, { body: { role: "STAFF" } }), "403 TARGET_ROLE_TOO_HIGH");
        check("tenant admin removes a peer tenant admin",
            await errorOf("DELETE", `/api/tenant/staff/${m.adminA3_A.uuid}`, t.adminA2), "403 TARGET_ROLE_TOO_HIGH");
        check("tenant admin assigns an unknown role",
            await errorOf("PATCH", `/api/tenant/staff/${m.newbie_A.uuid}`, t.adminA2, { body: { role: "OWNER" } }), "400 ROLE_INVALID");
        check("tenant admin makes a member REGIONAL_MANAGER",
            await status("PATCH", `/api/tenant/staff/${m.newbie_A.uuid}`, t.adminA2, { body: { role: "REGIONAL_MANAGER" } }), 200);
        check("tenant admin makes a member TENANT_ADMIN",
            await status("PATCH", `/api/tenant/staff/${m.promotee_A.uuid}`, t.adminA2, { body: { role: "TENANT_ADMIN" } }), 200);
        check("owner demotes a tenant admin",
            await status("PATCH", `/api/tenant/staff/${m.adminA3_A.uuid}`, t.ownerA, { body: { role: "STAFF" } }), 200);
        await prisma.tenantUser.update({ where: { uuid: m.newbie_A.uuid }, data: { role: "STAFF" } });

        console.log("\n=== Store role hierarchy (Phase 23) ===");
        const grant = (target: string, role: string) =>
            errorOf("POST", `/api/staff/${target}/store-access`, t.storeMgrA, { body: { storeUuid: a1, role } });
        check("store manager grants store ADMIN", await grant(u.newbie.uuid, "ADMIN"), "403 ROLE_NOT_ASSIGNABLE");
        check("store manager grants STORE_MANAGER (own level)", await grant(u.newbie.uuid, "STORE_MANAGER"), "403 ROLE_NOT_ASSIGNABLE");
        check("store manager grants MANAGER (same rank)", await grant(u.newbie.uuid, "MANAGER"), "403 ROLE_NOT_ASSIGNABLE");
        check("store manager changes own store access", await grant(u.storeMgrA.uuid, "CASHIER"), "403 CANNOT_MODIFY_SELF");
        check("store manager grants a member of another tenant", await grant(u.ownerB.uuid, "CASHIER"), "404 STAFF_NOT_FOUND");
        check("store manager revokes the store ADMIN",
            await errorOf("DELETE", `/api/staff/${u.storeAdminA.uuid}/store-access/${a1}`, t.storeMgrA), "403 TARGET_ROLE_TOO_HIGH");
        check("store manager grants CASHIER", (await grant(u.newbie.uuid, "CASHIER")).split(" ")[0], "201");
        const createStaff = (body: Record<string, unknown>) => errorOf("POST", "/api/staff", t.storeMgrA, {
            body: { storeUuid: a1, storeUuids: [a1], pin: "1234", firstName: "New", lastName: "Hire",
                    phoneNumber: `+1777${String(Date.now()).slice(-7)}`, ...body },
        });
        check("store manager creates staff as TENANT_ADMIN", await createStaff({ role: "TENANT_ADMIN" }), "403 ROLE_NOT_ASSIGNABLE");
        check("store manager creates staff as store ADMIN", await createStaff({ role: "STAFF", storeRoles: { [a1]: "ADMIN" } }), "403 ROLE_NOT_ASSIGNABLE");
        check("store manager creates staff at another tenant's store",
            await createStaff({ role: "STAFF", storeUuids: [ctx.b1.uuid] }), "404 STORE_NOT_FOUND");
        check("store manager edits the owner's phone (login identifier)",
            await errorOf("PATCH", `/api/staff/${u.ownerA.uuid}`, t.storeMgrA, { body: { storeUuid: a1, phoneNumber: "+15550000000" } }), "403 TARGET_ROLE_TOO_HIGH");
        check("store manager edits tenant B owner's phone",
            await errorOf("PATCH", `/api/staff/${u.ownerB.uuid}`, t.storeMgrA, { body: { storeUuid: a1, phoneNumber: "+15550000001" } }), "404 STAFF_NOT_FOUND");
        const ownerBPhone = (await prisma.user.findUniqueOrThrow({ where: { uuid: u.ownerB.uuid } })).phoneNumber;
        check("tenant B owner's phone unchanged", ownerBPhone === "+15550000001", false);

        console.log("\n=== Menu admin: no cross-tenant / cross-store writes (Phase 24) ===");
        const mn = ctx.menu;
        const price = async (productUuid: string) => (await prisma.product.findUnique({ where: { uuid: productUuid } }))?.basePrice;
        check("A1 manager reprices tenant B's product, naming A1",
            await errorOf("PATCH", `/api/admin/menu/products/${mn.b1.product}`, t.storeMgrA, { body: { storeUuid: a1, basePrice: 1 } }), "404 NOT_FOUND");
        check("tenant B product price unchanged", await price(mn.b1.product), 500);
        check("A1 manager deletes tenant B's product, naming A1",
            await errorOf("DELETE", `/api/admin/menu/products/${mn.b1.product}?storeUuid=${a1}`, t.storeMgrA), "404 NOT_FOUND");
        check("tenant B product still exists", await price(mn.b1.product), 500);
        check("A1 manager reprices an A2 product (no permission at A2), naming A1",
            await errorOf("PATCH", `/api/admin/menu/products/${mn.a2.product}`, t.storeMgrA, { body: { storeUuid: a1, basePrice: 1 } }), "403 FORBIDDEN");
        check("A2 product price unchanged", await price(mn.a2.product), 500);
        check("A1 manager reprices an A1 product",
            await status("PATCH", `/api/admin/menu/products/${mn.a1.product}`, t.storeMgrA, { body: { basePrice: 650 } }), 200);
        check("A1 product price updated", await price(mn.a1.product), 650);
        check("A1 product moved into tenant B's category",
            await errorOf("PATCH", `/api/admin/menu/products/${mn.a1.product}`, t.storeMgrA, { body: { categoryUuid: mn.b1.category } }), "400 CATEGORY_NOT_IN_STORE");
        check("A1 product created in tenant B's category",
            await errorOf("POST", "/api/admin/menu/products", t.storeMgrA, { body: { storeUuid: a1, categoryUuid: mn.b1.category, name: "Sneaky", basePrice: 100 } }), "400 CATEGORY_NOT_IN_STORE");
        check("product created at tenant B's store",
            await errorOf("POST", "/api/admin/menu/products", t.storeMgrA, { body: { storeUuid: ctx.b1.uuid, categoryUuid: mn.b1.category, name: "Sneaky", basePrice: 100 } }), "404 STORE_NOT_FOUND");
        check("A1 manager renames tenant B's category, naming A1",
            await errorOf("PATCH", `/api/admin/menu/categories/${mn.b1.category}`, t.storeMgrA, { body: { storeUuid: a1, name: "pwned" } }), "404 NOT_FOUND");
        check("A1 manager deletes tenant B's category",
            await errorOf("DELETE", `/api/admin/menu/categories/${mn.b1.category}?storeUuid=${a1}`, t.storeMgrA), "404 NOT_FOUND");
        const bulk = await call("POST", "/api/admin/menu/products/bulk/prices", t.storeMgrA, {
            body: { storeUuid: a1, updates: [{ productUuid: mn.b1.product, newPrice: 1 }, { productUuid: mn.a1.product, newPrice: 700 }] },
        });
        const bulkResults = bulk.body?.data?.results ?? bulk.body?.results ?? [];
        check("bulk price: tenant B product reported not found",
            bulkResults.find((r: any) => r.productUuid === mn.b1.product)?.error, "PRODUCT_NOT_FOUND");
        check("bulk price: tenant B product unchanged", await price(mn.b1.product), 500);
        check("bulk price: A1 product oldPrice is the old price",
            bulkResults.find((r: any) => r.productUuid === mn.a1.product)?.oldPrice, 650);
        check("link tenant B's option group to an A1 product",
            await errorOf("POST", `/api/admin/menu/products/${mn.a1.product}/option-groups/${mn.b1.group}`, t.storeMgrA), "404 OPTION_GROUP_NOT_FOUND");
        const linked = await call("POST", `/api/admin/menu/products/${mn.a1.product}/option-groups/${mn.a1.group}`, t.storeMgrA, {
            body: { productUuid: mn.b1.product },
        });
        check("link with body productUuid of tenant B: linked the URL's A1 product", linked.body?.link?.productUuid, mn.a1.product);
        check("tenant B product has no option groups",
            await prisma.productOptionGroup.count({ where: { productUuid: mn.b1.product } }), 0);

        console.log("\n=== Staff profile: tenant-scoped, no secrets (Phase 24) ===");
        const secretKeys = ["password", "passwordHash", "pinHash", "otpCode", "resetToken", "emailVerificationToken", "tokenVersion"];
        const leaks = (body: unknown) => {
            const text = JSON.stringify(body ?? {});
            return secretKeys.filter((k) => text.includes(`"${k}"`)).concat(text.includes("test-pin-hash") ? ["<pin hash value>"] : []);
        };
        check("customer reads a manager's profile", await status("GET", `/api/staff/${u.managerA.uuid}`, t.customerA), 403);
        check("cashier reads a manager's profile", await status("GET", `/api/staff/${u.managerA.uuid}`, t.cashierA), 403);
        check("A1 store manager reads tenant B owner's profile", await errorOf("GET", `/api/staff/${u.ownerB.uuid}`, t.storeMgrA), "404 STAFF_NOT_FOUND");
        const mgrView = await call("GET", `/api/staff/${u.cashierA.uuid}`, t.storeMgrA);
        check("A1 store manager reads an A1 cashier's profile", mgrView.status, 200);
        check("  ...no secret fields", leaks(mgrView.body).join(",") || "none", "none");
        check("  ...no pay rate for a store manager", JSON.stringify(mgrView.body).includes('"payRate"'), false);
        const ownerView = await call("GET", `/api/staff/${u.cashierA.uuid}`, t.ownerA);
        check("owner reads the cashier's profile", ownerView.status, 200);
        check("  ...no secret fields", leaks(ownerView.body).join(",") || "none", "none");
        check("  ...pay rate visible to the owner", JSON.stringify(ownerView.body).includes('"payRate"'), true);
        const selfView = await call("GET", `/api/staff/${u.cashierA.uuid}`, t.cashierA);
        check("cashier reads own profile", selfView.status, 200);
        check("  ...no secret fields", leaks(selfView.body).join(",") || "none", "none");

        console.log("\n=== Cash drawer (Phase 25) ===");
        const opened = await call("POST", "/api/staff/cash-drawer/open", t.cashierA, {
            body: { storeUuid: a1, startingCash: 10000, terminalId: "T-A1", userUuid: u.managerA.uuid },
        });
        check("cashier opens a drawer", opened.status, 201);
        const drawer = opened.body?.drawer;
        check("  ...in their own name (body userUuid ignored)", drawer?.userUuid, u.cashierA.uuid);
        check("customer opens a drawer (tenant STAFF role, no store assignment)",
            await errorOf("POST", "/api/staff/cash-drawer/open", t.customerA, { body: { storeUuid: a1, startingCash: 0 } }), "403 INSUFFICIENT_ROLE");
        check("open at tenant B's store",
            await errorOf("POST", "/api/staff/cash-drawer/open", t.cashierA, { body: { storeUuid: ctx.b1.uuid, startingCash: 0 } }), "404 STORE_NOT_FOUND");

        // One cash sale on this drawer's terminal, one on another terminal of the same store
        const sale = (orderUuid: string, terminalId: string) => call("POST", "/api/cashier/process", t.cashierA, {
            body: { orderUuid, paymentMethod: "CASH", amount: 400, amountTendered: 400, changeGiven: 0, terminalId },
        });
        const drawerSale = await sale(o.a1DrawerSale.uuid, "T-A1");
        const elsewhere = await sale(o.a1OtherTerminalSale.uuid, "T-OTHER");
        check("sale on the drawer's terminal", drawerSale.status, 201);
        check("sale on another terminal", elsewhere.status, 201);
        const linkedPayment = await prisma.payment.findUnique({ where: { uuid: drawerSale.body?.data?.uuid } });
        check("  ...payment linked to the drawer", linkedPayment?.drawerUuid, drawer.uuid);

        const drop = (token: string, amount: unknown) =>
            call("POST", `/api/staff/cash-drawer/${drawer.uuid}/drop`, token, { body: { amount, reason: "To safe" } });
        check("negative drop", `${(await drop(t.cashierA, -500)).status}`, "400");
        check("zero drop", `${(await drop(t.cashierA, 0)).status}`, "400");
        check("customer drops from the drawer", await errorOf("POST", `/api/staff/cash-drawer/${drawer.uuid}/drop`, t.customerA, { body: { amount: 1000, reason: "To safe" } }), "403 INSUFFICIENT_ROLE");
        check("customer closes the drawer", await errorOf("POST", `/api/staff/cash-drawer/${drawer.uuid}/close`, t.customerA, { body: { actualCash: 0 } }), "403 INSUFFICIENT_ROLE");
        check("another cashier drops from it (not theirs)", (await drop(t.newbie, 1000)).body?.error, "DRAWER_NOT_YOURS");
        const fakeDrop = await drop(t.cashierA, 2000);   // never verified: cash "dropped" but kept
        const realDrop = await drop(t.cashierA, 1000);   // verified by the manager below
        check("cashier records two drops", `${fakeDrop.status},${realDrop.status}`, "201,201");
        const verify = (token: string, dropUuid: string) => errorOf("POST", `/api/staff/cash-drawer/drop/${dropUuid}/verify`, token);
        check("cashier verifies own drop", await verify(t.cashierA, realDrop.body?.cashDrop?.uuid), "403 INSUFFICIENT_ROLE");
        check("manager verifies the drop", (await verify(t.managerA, realDrop.body?.cashDrop?.uuid)).split(" ")[0], "200");
        check("manager verifies it again", await verify(t.managerA, realDrop.body?.cashDrop?.uuid), "409 DROP_ALREADY_VERIFIED");

        const close = (token: string, drawerUuid: string, actualCash: number) =>
            call("POST", `/api/staff/cash-drawer/${drawerUuid}/close`, token, { body: { actualCash } });
        check("A1 manager closes tenant B's drawer", (await close(t.managerA, ctx.drawerB.uuid, 0)).status, 404);
        check("customer closes the drawer", (await close(t.customerA, drawer.uuid, 0)).status, 403);
        check("another cashier closes it", (await close(t.newbie, drawer.uuid, 0)).body?.error, "DRAWER_NOT_YOURS");

        // Starting 10000 + this drawer's 400 sale - verified 1000 drop = 9400.
        // The cashier kept the 2000 "drop" and counts 7400: a 2000 shortage.
        const counts = [7400, 9400, 9400, 9400, 9400];
        const closes = await Promise.all(counts.map((c) => close(t.cashierA, drawer.uuid, c)));
        const won = closes.filter((r) => r.status === 200);
        console.log(`  concurrent closes: ${closes.map((r) => r.status).join(", ")}`);
        check("concurrent closes that succeeded", won.length, 1);
        check("  ...the rest rejected DRAWER_NOT_OPEN", closes.filter((r) => r.body?.error === "DRAWER_NOT_OPEN").length, counts.length - 1);
        const closedRow = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: drawer.uuid } });
        check("stored count is the winning close's count", closedRow.actualCash, won[0]?.body?.actualCash);
        check("expected cash: this drawer only, verified drops only", won[0]?.body?.expectedCash, 9400);
        check("unverified drops reported", won[0]?.body?.unverifiedDrops, 2000);
        if (won[0]?.body?.actualCash === 7400) {
            check("fake drop shows as a 2000 shortage", won[0]?.body?.variance, -2000);
            check("  ...and needs approval", closedRow.status, "RECONCILING");
        }
        check("drop after close", (await drop(t.cashierA, 500)).body?.error, "DRAWER_NOT_OPEN");
        check("verify the fake drop after close", await verify(t.managerA, fakeDrop.body?.cashDrop?.uuid), "409 DRAWER_NOT_OPEN");

        console.log("\n=== Time clock: only yourself (Phase 25) ===");
        const clock = (path: string, token: string, body: Record<string, unknown>) =>
            errorOf("POST", `/api/staff/time-entry/${path}`, token, { body: { deviceId: "test-device", ...body } });
        check("manager clocks the cashier in", await clock("clock-in", t.managerA, { userUuid: u.cashierA.uuid, storeUuid: a1 }), "403 CANNOT_CLOCK_OTHERS");
        check("cashier clocks in at tenant B's store", await clock("clock-in", t.cashierA, { storeUuid: ctx.b1.uuid }), "404 STORE_NOT_FOUND");
        const clockedIn = await call("POST", "/api/staff/time-entry/clock-in", t.cashierA, { body: { storeUuid: a1, deviceId: "test-device" } });
        check("cashier clocks self in", clockedIn.status, 201);
        const entryUuid = clockedIn.body?.timeEntry?.uuid;
        check("  ...entry is the cashier's", clockedIn.body?.timeEntry?.userUuid, u.cashierA.uuid);
        check("manager starts a break on the cashier's entry",
            await errorOf("POST", "/api/staff/time-entry/break/start", t.managerA, { body: { timeEntryUuid: entryUuid, breakType: "MEAL" } }), "404 TIME_ENTRY_NOT_FOUND");
        const brk = await call("POST", "/api/staff/time-entry/break/start", t.cashierA, { body: { timeEntryUuid: entryUuid, breakType: "MEAL" } });
        check("cashier starts own break", brk.status, 201);
        check("manager ends the cashier's break",
            await errorOf("POST", "/api/staff/time-entry/break/end", t.managerA, { body: { breakEntryUuid: brk.body?.breakEntry?.uuid } }), "404 BREAK_NOT_FOUND");
        check("cashier ends own break",
            (await errorOf("POST", "/api/staff/time-entry/break/end", t.cashierA, { body: { breakEntryUuid: brk.body?.breakEntry?.uuid } })).split(" ")[0], "200");
        check("manager clocks the cashier out", await clock("clock-out", t.managerA, { userUuid: u.cashierA.uuid, storeUuid: a1 }), "403 CANNOT_CLOCK_OTHERS");
        check("cashier clocks self out", (await clock("clock-out", t.cashierA, { storeUuid: a1 })).split(" ")[0], "200");

        const { shifts, entries, drawers, requests } = ctx.p26;
        const a2 = ctx.a2.uuid;

        console.log("\n=== Shifts: store from the shift itself (Phase 26) ===");
        const patchShift = (token: string, shiftUuid: string, query = "") =>
            errorOf("PATCH", `/api/staff/shifts/${shiftUuid}${query}`, token, { body: { notes: "moved" } });
        check("A1 manager edits an A2 shift, naming A1", (await patchShift(t.managerA, shifts.a2.uuid, `?storeUuid=${a1}`)).split(" ")[0], "403");
        check("A1 manager edits tenant B's shift", (await patchShift(t.managerA, shifts.b1.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("cashier edits an A1 shift", (await patchShift(t.cashierA, shifts.a1.uuid)).split(" ")[0], "403");
        check("A1 manager edits an A1 shift", (await patchShift(t.managerA, shifts.a1.uuid)).split(" ")[0], "200");
        const cancelShift = (token: string, shiftUuid: string, query = "") =>
            errorOf("DELETE", `/api/staff/shifts/${shiftUuid}${query}`, token);
        check("A1 manager cancels an A2 shift, naming A1", (await cancelShift(t.managerA, shifts.a2.uuid, `?storeUuid=${a1}`)).split(" ")[0], "403");
        check("A1 manager cancels tenant B's shift", (await cancelShift(t.managerA, shifts.b1.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("A1 manager cancels an A1 shift (no body)", (await cancelShift(t.managerA, shifts.a1b.uuid)).split(" ")[0], "200");
        const untouched = await prisma.shift.findMany({ where: { uuid: { in: [shifts.a2.uuid, shifts.b1.uuid] } } });
        check("  ...A2 and B shifts untouched", untouched.every((sh) => sh.status === "SCHEDULED" && sh.notes === null), true);

        console.log("\n=== Time entries: tenant-bound, pay hidden (Phase 26) ===");
        const period = "periodStart=2030-01-01&periodEnd=2030-03-01";
        const entriesOf = (token: string, userUuid: string, extra = "") =>
            call("GET", `/api/staff/time-entry/user/${userUuid}?${period}${extra}`, token);
        const stores = (r: { body: any }) => (r.body?.entries ?? []).map((e: any) => e.storeUuid === a1 ? "A1" : e.storeUuid === a2 ? "A2" : "OTHER").sort().join(",");
        const hasPay = (r: { body: any }) => (r.body?.entries ?? []).some((e: any) => "payRate" in e || "totalPay" in e);

        const own = await entriesOf(t.cashierA, u.cashierA.uuid);
        check("cashier reads own entries", `${own.status} ${stores(own)}`, "200 A1,A2");
        check("  ...with own pay", hasPay(own), true);
        const ownerOwn = await entriesOf(t.ownerA, u.ownerA.uuid);
        check("A owner's own entries leave out tenant B's", `${ownerOwn.status} ${(ownerOwn.body?.entries ?? []).length}`, "200 0");
        const asAdmin = await entriesOf(t.ownerA, u.cashierA.uuid);
        check("owner reads the cashier's entries", `${asAdmin.status} ${stores(asAdmin)}`, "200 A1,A2");
        check("  ...with pay", hasPay(asAdmin), true);
        const asManager = await entriesOf(t.managerA, u.cashierA.uuid);
        check("A1 manager reads the cashier's entries", `${asManager.status} ${stores(asManager)}`, "200 A1");
        check("  ...without pay", hasPay(asManager), false);
        check("A1 manager asks for A2 entries", (await entriesOf(t.managerA, u.cashierA.uuid, `&storeUuid=${a2}`)).status, 403);
        check("cashier reads the manager's entries", (await entriesOf(t.cashierA, u.managerA.uuid)).status, 403);
        check("A1 manager reads tenant B's owner", (await entriesOf(t.managerA, u.ownerB.uuid, `&storeUuid=${a1}`)).status, 404);
        check("bad period", (await call("GET", `/api/staff/time-entry/user/${u.cashierA.uuid}?periodStart=x&periodEnd=y`, t.cashierA)).status, 400);

        const approveEntry = (token: string, entryUuid: string, query = "") =>
            errorOf("POST", `/api/staff/time-entry/${entryUuid}/approve${query}`, token);
        check("A1 supervisor approves an A2 entry, naming A1", (await approveEntry(t.supervisorA, entries.cashierA2.uuid, `?storeUuid=${a1}`)).split(" ")[0], "403");
        check("A1 supervisor approves tenant B's entry", (await approveEntry(t.supervisorA, entries.ownerB_B1.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("manager approves own entry", await approveEntry(t.managerA, entries.managerA1.uuid), "403 TIME_ENTRY_SELF_APPROVE");

        console.log("\n=== Approvals: store from the request itself (Phase 26) ===");
        const respond = (action: "approve" | "reject", token: string, requestUuid: string, query = "") =>
            errorOf("POST", `/api/staff/approvals/${requestUuid}/${action}${query}`, token, { body: { notes: "ok" } });
        check("A1 manager approves tenant B's request", (await respond("approve", t.managerA, requests.b1.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("A1 manager approves an A2 request, naming A1", (await respond("approve", t.managerA, requests.varA2.uuid, `?storeUuid=${a1}`)).split(" ")[0], "403");
        check("cashier approves own request", (await respond("approve", t.cashierA, requests.lateA1.uuid)).split(" ")[0], "403");
        check("supervisor approves a cash variance", (await respond("approve", t.supervisorA, requests.varA1.uuid)).split(" ")[0], "403");
        check("manager approves own request", await respond("approve", t.managerA, requests.lateMgr.uuid), "403 APPROVAL_SELF");
        check("supervisor approves a late clock-in", (await respond("approve", t.supervisorA, requests.lateA1.uuid)).split(" ")[0], "200");
        const approvedEntry = await prisma.timeEntry.findUniqueOrThrow({ where: { uuid: entries.cashierA1.uuid } });
        check("  ...entry approved by the supervisor, not requestData", approvedEntry.approvedBy, u.supervisorA.uuid);
        check("  ...approving it again", await respond("approve", t.supervisorA, requests.lateA1.uuid), "409 APPROVAL_NOT_PENDING");
        check("manager approves the A1 cash variance", (await respond("approve", t.managerA, requests.varA1.uuid)).split(" ")[0], "200");
        const signedOff = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: drawers.varA1.uuid } });
        check("  ...drawer closed, signed off by the manager", `${signedOff.status} ${signedOff.varianceApprovedBy === u.managerA.uuid}`, "CLOSED true");
        check("supervisor rejects a missed clock-out", (await respond("reject", t.supervisorA, requests.missedA1.uuid)).split(" ")[0], "200");
        check("  ...rejecting it again", await respond("reject", t.supervisorA, requests.missedA1.uuid), "409 APPROVAL_NOT_PENDING");

        console.log("\n=== Cash variance route (Phase 26) ===");
        const approveVariance = (token: string, drawerUuid: string, query = "") =>
            errorOf("POST", `/api/staff/cash-drawer/${drawerUuid}/approve-variance${query}`, token, { body: { notes: "counted twice" } });
        check("cashier approves own variance", await approveVariance(t.cashierA, drawers.varA1b.uuid), "403 INSUFFICIENT_ROLE");
        check("supervisor approves a variance", await approveVariance(t.supervisorA, drawers.varA1b.uuid), "403 INSUFFICIENT_ROLE");
        check("A1 manager approves tenant B's drawer", (await approveVariance(t.managerA, ctx.drawerB.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("A1 manager approves an A2 drawer, naming A1", (await approveVariance(t.managerA, drawers.varA2.uuid, `?storeUuid=${a1}`)).split(" ")[0], "403");
        check("manager approves own drawer's variance", await approveVariance(t.managerA, drawers.varMgr.uuid), "403 VARIANCE_SELF_APPROVE");
        check("store manager approves the variance", (await approveVariance(t.storeMgrA, drawers.varA1b.uuid)).split(" ")[0], "200");
        const resolved = await prisma.staffApprovalRequest.findUniqueOrThrow({ where: { uuid: requests.varA1b.uuid } });
        check("  ...pending request resolved too", `${resolved.status} ${resolved.approvedBy === u.storeMgrA.uuid}`, "APPROVED true");
        check("  ...approving it again", await approveVariance(t.storeMgrA, drawers.varA1b.uuid), "409 DRAWER_NOT_RECONCILING");
        check("owner approves an open drawer", await approveVariance(t.ownerA, drawers.openA1.uuid), "409 DRAWER_NOT_RECONCILING");

        console.log("\n=== Tip pool job (Phase 26) ===");
        // Production has no global prisma (config/prisma.ts sets it outside
        // production only); the job used to read that global. Stub the per-store
        // calculation so this stays read-only.
        const { TipPoolCalculationJob } = await import("../src/jobs/staff/TipPoolCalculation.job.ts");
        const { TipsAndCommissionService } = await import("../src/services/staff/TipsAndCommission.service.ts");
        const realCalculate = TipsAndCommissionService.calculateTipPool;
        const savedGlobal = (globalThis as any).prisma;
        let calculated = 0;
        (TipsAndCommissionService as any).calculateTipPool = async () => { calculated++; };
        (globalThis as any).prisma = undefined;
        try {
            const result = await TipPoolCalculationJob.run().catch((e: Error) => ({ crashed: e.message }));
            const activeStores = await prisma.store.count({ where: { active: true } });
            check("job runs without the dev-only global", "crashed" in result ? `crashed: ${result.crashed}` : `${result.processed}/${activeStores} errors=${result.errors}`, `${activeStores}/${activeStores} errors=0`);
            check("  ...calculated each active store", calculated, activeStores);
        } finally {
            (TipsAndCommissionService as any).calculateTipPool = realCalculate;
            (globalThis as any).prisma = savedGlobal;
        }
        console.log("\n=== Shift swaps: store from the swap's shift (Phase 29) ===");
        const { swaps, pools, violations, upcoming, orders: p29Orders } = ctx.p29;
        const respondSwap = (token: string, swapUuid: string, body: unknown = { approved: true }, query = "") =>
            errorOf("POST", `/api/staff/shifts/swap/${swapUuid}/respond${query}`, token, { body });
        check("A1 supervisor answers an A2 swap, naming A1", await respondSwap(t.supervisorA, swaps.a2.uuid, undefined, `?storeUuid=${a1}`), "403 INSUFFICIENT_ROLE");
        check("A1 supervisor answers tenant B's swap", await respondSwap(t.supervisorA, swaps.b1.uuid, undefined, `?storeUuid=${a1}`), "404 NOT_FOUND");
        check("cashier answers own swap", await respondSwap(t.cashierA, swaps.a1.uuid), "403 INSUFFICIENT_ROLE");
        check("supervisor answers a swap they're party to", await respondSwap(t.supervisorA, swaps.a1WithSupervisor.uuid), "403 SWAP_SELF_APPROVE");
        check("supervisor answers without approved", await respondSwap(t.supervisorA, swaps.a1.uuid, {}), "400 VALIDATION_ERROR");
        check("supervisor approves an A1 swap", (await respondSwap(t.supervisorA, swaps.a1.uuid)).split(" ")[0], "200");
        check("  ...answering it again", await respondSwap(t.managerA, swaps.a1.uuid, { approved: false }), "409 SWAP_NOT_PENDING");
        const otherSwaps = await prisma.shiftSwapRequest.findMany({ where: { uuid: { in: [swaps.a2.uuid, swaps.b1.uuid] } } });
        check("  ...A2 and B swaps still pending", otherSwaps.every((sw) => sw.status === "PENDING"), true);

        console.log("\n=== Tip distribution: store from the pool (Phase 29) ===");
        const distribute = (token: string, poolUuid: string, query = "") =>
            errorOf("POST", `/api/staff/tips/${poolUuid}/distribute${query}`, token, { body: {} });
        check("supervisor distributes an A1 pool", await distribute(t.supervisorA, pools.a1.uuid), "403 INSUFFICIENT_ROLE");
        check("A1 manager distributes an A2 pool, naming A1", await distribute(t.managerA, pools.a2.uuid, `?storeUuid=${a1}`), "403 INSUFFICIENT_ROLE");
        check("A1 manager distributes tenant B's pool", await distribute(t.managerA, pools.b1.uuid, `?storeUuid=${a1}`), "404 NOT_FOUND");
        check("A1 manager distributes an open pool", await distribute(t.managerA, pools.a1Open.uuid), "409 TIP_POOL_NOT_CALCULATED");
        check("A1 manager distributes the A1 pool", (await distribute(t.managerA, pools.a1.uuid)).split(" ")[0], "200");
        check("  ...distributing it again", await distribute(t.managerA, pools.a1.uuid), "409 TIP_POOL_NOT_CALCULATED");
        const otherPools = await prisma.tipPool.findMany({ where: { uuid: { in: [pools.a2.uuid, pools.b1.uuid] } } });
        check("  ...A2 and B pools untouched", otherPools.every((p) => p.status === "CALCULATED"), true);

        console.log("\n=== Break violations: store from the violation (Phase 29) ===");
        const ack = (token: string, violationUuid: string, query = "") =>
            errorOf("POST", `/api/staff/break-enforcement/violations/${violationUuid}/acknowledge${query}`, token);
        const waive = (token: string, violationUuid: string, body: unknown = { reason: "rush hour" }) =>
            errorOf("POST", `/api/staff/break-enforcement/violations/${violationUuid}/waive`, token, { body });
        check("A1 supervisor acknowledges an A2 violation, naming A1", await ack(t.supervisorA, violations.a2.uuid, `?storeUuid=${a1}`), "403 INSUFFICIENT_ROLE");
        check("A1 supervisor acknowledges tenant B's violation", await ack(t.supervisorA, violations.b1.uuid, `?storeUuid=${a1}`), "404 NOT_FOUND");
        check("cashier acknowledges own violation", await ack(t.cashierA, violations.a1.uuid), "403 INSUFFICIENT_ROLE");
        check("supervisor acknowledges own violation", await ack(t.supervisorA, violations.supervisorOwn.uuid), "403 VIOLATION_SELF_REVIEW");
        check("supervisor acknowledges an A1 violation", (await ack(t.supervisorA, violations.a1.uuid)).split(" ")[0], "200");
        check("  ...acknowledging it again", await ack(t.supervisorA, violations.a1.uuid), "409 VIOLATION_ALREADY_ACKNOWLEDGED");
        check("supervisor waives a violation", await waive(t.supervisorA, violations.a1b.uuid), "403 INSUFFICIENT_ROLE");
        check("manager waives without a reason", await waive(t.managerA, violations.a1b.uuid, {}), "400 VALIDATION_ERROR");
        check("manager waives an A2 violation", await waive(t.managerA, violations.a2.uuid), "403 INSUFFICIENT_ROLE");
        check("manager waives an A1 violation", (await waive(t.managerA, violations.a1b.uuid)).split(" ")[0], "200");
        check("  ...waiving it again", await waive(t.managerA, violations.a1b.uuid), "409 VIOLATION_ALREADY_WAIVED");

        console.log("\n=== Break check: owner or supervisor at the entry's store (Phase 29) ===");
        const breakCheck = (token: string, entryUuid: string) => errorOf("GET", `/api/staff/break-enforcement/check/${entryUuid}`, token);
        check("cashier checks own A2 entry", (await breakCheck(t.cashierA, entries.cashierA2.uuid)).split(" ")[0], "200");
        check("A1 supervisor checks the cashier's A1 entry", (await breakCheck(t.supervisorA, entries.cashierA1.uuid)).split(" ")[0], "200");
        check("A1 supervisor checks the cashier's A2 entry", await breakCheck(t.supervisorA, entries.cashierA2.uuid), "403 INSUFFICIENT_ROLE");
        check("customer checks the cashier's entry", await breakCheck(t.customerA, entries.cashierA1.uuid), "403 INSUFFICIENT_ROLE");
        check("A1 supervisor checks tenant B's entry", await breakCheck(t.supervisorA, entries.ownerB_B1.uuid), "404 TIME_ENTRY_NOT_FOUND");

        console.log("\n=== Per-user records: shifts, tips, commission, order stats (Phase 29) ===");
        const shiftsOf = (token: string, userUuid: string, query = "") => call("GET", `/api/staff/shifts/user/${userUuid}${query}`, token);
        const shiftStores = (r: { body: any }) => (r.body?.shifts ?? r.body?.data ?? [])
            .filter((sh: any) => [upcoming.a1.uuid, upcoming.a2.uuid].includes(sh.uuid))
            .map((sh: any) => sh.storeUuid === a1 ? "A1" : "A2").sort().join(",");
        const ownShifts = await shiftsOf(t.cashierA, u.cashierA.uuid);
        check("cashier reads own shifts", `${ownShifts.status} ${shiftStores(ownShifts)}`, "200 A1,A2");
        const mgrShifts = await shiftsOf(t.managerA, u.cashierA.uuid);
        check("A1 manager reads the cashier's shifts", `${mgrShifts.status} ${shiftStores(mgrShifts)}`, "200 A1");
        check("A1 manager asks for the cashier's A2 shifts", (await shiftsOf(t.managerA, u.cashierA.uuid, `?storeUuid=${a2}`)).status, 403);
        check("customer reads the cashier's shifts", (await shiftsOf(t.customerA, u.cashierA.uuid)).status, 403);
        check("A1 manager reads tenant B owner's shifts", (await shiftsOf(t.managerA, u.ownerB.uuid)).status, 404);
        for (const [label, path] of [["tip summary", "tips/summary"], ["commission summary", "commission/summary"], ["order stats", "orders/stats"]] as const) {
            const read = (token: string, userUuid: string, storeUuid: string) => errorOf("GET", `/api/staff/${path}/${userUuid}?storeUuid=${storeUuid}`, token);
            check(`cashier reads own ${label}`, (await read(t.cashierA, u.cashierA.uuid, a1)).split(" ")[0], "200");
            check(`owner reads the cashier's ${label}`, (await read(t.ownerA, u.cashierA.uuid, a1)).split(" ")[0], "200");
            check(`customer reads the cashier's ${label}`, await read(t.customerA, u.cashierA.uuid, a1), "403 FORBIDDEN");
            check(`cashier reads own ${label} at tenant B's store`, await read(t.cashierA, u.cashierA.uuid, ctx.b1.uuid), "404 STORE_NOT_FOUND");
            check(`owner reads tenant B owner's ${label}`, await read(t.ownerA, u.ownerB.uuid, a1), "404 STAFF_NOT_FOUND");
        }

        console.log("\n=== Order attribution: staff at the order's store (Phase 29) ===");
        const attr = (path: string, token: string, orderUuid: string, body: unknown = {}) =>
            errorOf("POST", `/api/staff/orders/${orderUuid}/${path}`, token, { body });
        check("customer takes an A1 order", await attr("taken-by", t.customerA, p29Orders.a1.uuid), "403 INSUFFICIENT_ROLE");
        check("A1 cashier takes an A2 order", await attr("taken-by", t.cashierA, p29Orders.a2.uuid), "403 INSUFFICIENT_ROLE");
        check("A1 cashier takes tenant B's order", await attr("taken-by", t.cashierA, p29Orders.b1.uuid), "404 NOT_FOUND");
        check("cashier takes an A1 order", (await attr("taken-by", t.cashierA, p29Orders.a1.uuid)).split(" ")[0], "200");
        check("  ...supervisor takes it over", await attr("taken-by", t.supervisorA, p29Orders.a1.uuid), "409 ALREADY_ATTRIBUTED");
        check("cashier sets the full attribution", await attr("attribution", t.cashierA, p29Orders.a1.uuid, { servedBy: u.cashierA.uuid }), "403 INSUFFICIENT_ROLE");
        check("supervisor credits tenant B's owner", await attr("attribution", t.supervisorA, p29Orders.a1.uuid, { servedBy: u.ownerB.uuid }), "400 NOT_STAFF_AT_STORE");
        check("cashier credits a customer as preparer", await attr("prepared-by", t.cashierA, p29Orders.a1.uuid, { userUuid: u.customerA.uuid }), "400 NOT_STAFF_AT_STORE");
        check("cashier adds self as preparer", (await attr("prepared-by", t.cashierA, p29Orders.a1.uuid, { userUuid: u.cashierA.uuid })).split(" ")[0], "200");
        check("cashier serves the order", (await attr("served-by", t.cashierA, p29Orders.a1.uuid)).split(" ")[0], "200");
        check("supervisor reassigns the server", (await attr("attribution", t.supervisorA, p29Orders.a1b.uuid, { servedBy: u.supervisorA.uuid, takenBy: u.cashierA.uuid })).split(" ")[0], "200");
        const attributed = await prisma.order.findUniqueOrThrow({ where: { uuid: p29Orders.a1.uuid } });
        check("  ...A1 order credits", `${attributed.takenBy === u.cashierA.uuid} ${attributed.servedBy === u.cashierA.uuid} ${attributed.preparedBy.join() === u.cashierA.uuid}`, "true true true");
        const untouchedOrders = await prisma.order.findMany({ where: { uuid: { in: [p29Orders.a2.uuid, p29Orders.b1.uuid] } } });
        check("  ...A2 and B orders untouched", untouchedOrders.every((o) => o.takenBy === null && o.servedBy === null), true);

        console.log("\n=== Webhook replay: real ledger fields (Phase 30) ===");
        const { events } = ctx.p30;
        const replayOne = (token: string, eventId: string, body: unknown = { provider: "stripe" }) =>
            call("POST", `/api/admin/webhooks/replay/${eventId}`, token, { body });
        check("tenant owner replays an event", (await replayOne(t.ownerA, events.done.providerEventId!)).status, 403);
        const replayed = await replayOne(t.superAdmin, events.done.providerEventId!);
        check("super admin replays a stored event", `${replayed.status} ${replayed.body?.replay?.status}`, "200 SUCCESS");
        check("  ...replay names the provider's event id", replayed.body?.replay?.eventUuid, events.done.providerEventId);
        const ledgerRow = await prisma.webhookEvent.findUniqueOrThrow({ where: { uuid: events.done.uuid } });
        check("  ...ledger updated by the handler (unhandled type)", ledgerRow.status, "IGNORED");
        check("unknown event id", `${(await replayOne(t.superAdmin, `evt_missing_${runId}`)).status} ${(await replayOne(t.superAdmin, `evt_missing_${runId}`)).body?.error}`, "404 WEBHOOK_EVENT_NOT_FOUND");
        check("event still processing", (await replayOne(t.superAdmin, events.busy.providerEventId!)).body?.error, "WEBHOOK_EVENT_IN_PROGRESS");
        const busyReplays = await prisma.webhookReplay.count({ where: { webhookEventUuid: events.busy.uuid } });
        check("  ...no replay recorded", busyReplays, 0);
        check("unsupported provider", (await replayOne(t.superAdmin, events.done.providerEventId!, { provider: "paypal" })).body?.error, "UNSUPPORTED_PROVIDER");
        const range = await call("POST", "/api/admin/webhooks/replay/range", t.superAdmin, {
            body: { provider: "stripe", eventType: "customer.created", startDate: new Date(Date.now() - 3_600_000).toISOString(), endDate: new Date().toISOString() },
        });
        check("range route reachable (not taken as an event id)", `${range.status} ${range.body?.results?.failed >= 1 && range.body?.results?.success >= 1}`, "200 true");
        check("range with a bad date", (await call("POST", "/api/admin/webhooks/replay/range", t.superAdmin, { body: { provider: "stripe", startDate: "x", endDate: "y" } })).status, 400);
    } finally {
        server.close();
    }

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-rbac failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        fakeUpstash?.close();
        await prisma.$disconnect();
    });
