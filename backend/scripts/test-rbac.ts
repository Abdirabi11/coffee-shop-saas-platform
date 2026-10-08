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

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let phoneSeq = 0;

async function user(name: string, globalRole: "ADMIN" | "CUSTOMER") {
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

    // Tokens carry the global role and login tenant, exactly as TokenService issues them
    const token = (u: { uuid: string; globalRole: string; tokenVersion: number }, tenantUuid: string) =>
        signAccessToken({ userUuid: u.uuid, role: u.globalRole as any, tenantUuid, tokenVersion: u.tokenVersion });

    return {
        tA, tB, a1, a2, b1, exceptionB, orders, drawerB,
        users: { ownerA, ownerB, storeAdminA, storeMgrA, newbie, cashierA, managerA },
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
        check("customer drops from the drawer", (await drop(t.customerA, 1000)).status, 403);
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
