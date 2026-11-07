// Dashboard routing, store-local live metrics and alert-job priority, against
// a real database:
//   1. The dashboard routers server.ts mounts answer, with the right access:
//      store roles checked at the store named in the URL, tenant dashboards
//      for tenant admins, the staff dashboard for the caller's own user, the
//      super admin dashboard for super admins only.
//   2. Real-time StoreDailyMetrics land on the store's local day (the key the
//      nightly job uses), not the server's midnight.
//   3. The stuck-order and preparation-delay jobs alert oldest first and,
//      once those are alerted, reach the newer ones on the next run.
//
// Each run creates its own tenants and stores. Exits non-zero if any check
// fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
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

const { default: express } = await import("express");
const { default: prisma } = await import("../src/config/prisma.ts");
const { signAccessToken } = await import("../src/utils/jwt.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { default: storeDashboardRoutes } = await import("../src/routes/dashboards/store.routes.ts");
const { default: tenantDashboardRoutes } = await import("../src/routes/dashboards/tenant.routes.ts");
const { default: staffDashboardRoutes } = await import("../src/routes/dashboards/staff.routes.ts");
const { default: superAdminDashboardRoutes } = await import("../src/routes/dashboards/superadmin.routes.ts");
const { StoreDailyMetricsService } = await import("../src/services/Dashboards/StoreDailyMetrics.service.ts");
const { DetectStuckOrdersJob } = await import("../src/jobs/Order/detectStuckOrders.job.ts");
const { OrderTimeoutAlertJob } = await import("../src/jobs/Order/orderTimeoutAlert.job.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let phoneSeq = 0;

async function user(name: string, globalRole: "SUPER_ADMIN" | "ADMIN" | "CUSTOMER") {
    const phoneNumber = `+1998${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, "0")}`;
    return prisma.user.create({ data: { phoneNumber, firstName: name, lastName: "Dash", globalRole } });
}

let planUuid: string | undefined;
async function plan() {
    if (planUuid) return planUuid;
    const created = await prisma.plan.create({ data: { name: `Dash ${runId}`, slug: `dash-${runId}` } });
    await prisma.planVersion.create({ data: { planUuid: created.uuid, version: 1, priceMonthly: 0, features: {} } });
    await prisma.planPrice.create({ data: { planUuid: created.uuid, interval: "MONTHLY", amount: 0 } });
    return (planUuid = created.uuid);
}

async function tenant(label: string, ownerUuid: string) {
    const created = await prisma.tenant.create({
        data: { name: `Dash ${label} ${runId}`, slug: `dash-${label.toLowerCase()}-${runId}`, email: `${label}@dash.test`, ownerUuid },
    });
    await SubscriptionService.createSubscription({ tenantUuid: created.uuid, planUuid: await plan(), interval: "MONTHLY" });
    return created;
}

async function member(tenantUuid: string, userUuid: string, role: "TENANT_ADMIN" | "STAFF", slug: string) {
    return prisma.tenantUser.create({ data: { tenantUuid, userUuid, role, slug: `${slug}-${runId}` } });
}

async function store(tenantUuid: string, label: string, tz = "UTC") {
    return prisma.store.create({
        data: { tenantUuid, name: `Dash ${label} ${runId}`, slug: `dash-${label.toLowerCase()}-${runId}`, city: "Mogadishu", timezone: tz },
    });
}

async function assign(userUuid: string, tenantUserUuid: string, tenantUuid: string, storeUuid: string, role: "ADMIN" | "MANAGER" | "CASHIER") {
    return prisma.userStore.create({ data: { userUuid, tenantUserUuid, tenantUuid, storeUuid, role } });
}

let orderSeq = 0;
async function order(tenantUuid: string, storeUuid: string, tenantUserUuid: string, status: "PAID" | "PREPARING", minutesAgo: number) {
    const at = new Date(Date.now() - minutesAgo * 60_000);
    return prisma.order.create({
        data: {
            tenantUuid, storeUuid, tenantUserUuid,
            orderNumber: `DASH-${runId}-${orderSeq++}`,
            status, paymentStatus: "COMPLETED", currency: "USD",
            subtotal: 400, totalAmount: 400, menuVersion: 1,
            pricingSnapshot: { items: [], calculations: { subtotal: 400, total: 400 } },
            createdAt: at, updatedAt: at,
        },
    });
}

const alertedOrders = async (tenantUuid: string, prefix: string) =>
    new Set(
        (await prisma.adminAlert.findMany({ where: { tenantUuid, groupKey: { startsWith: prefix } }, select: { affectedEntityId: true } }))
            .map((a) => a.affectedEntityId)
    );

async function main() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    const ownerA = await user("OwnerA", "ADMIN");
    const ownerB = await user("OwnerB", "ADMIN");
    const managerA = await user("ManagerA", "CUSTOMER");
    const cashierA = await user("CashierA", "CUSTOMER");
    const customerA = await user("CustomerA", "CUSTOMER");
    const superAdmin = await user("Super", "SUPER_ADMIN");

    const tA = await tenant("A", ownerA.uuid);
    const tB = await tenant("B", ownerB.uuid);
    const ownerA_A = await member(tA.uuid, ownerA.uuid, "TENANT_ADMIN", "owner-a");
    await member(tB.uuid, ownerB.uuid, "TENANT_ADMIN", "owner-b");
    const managerA_A = await member(tA.uuid, managerA.uuid, "STAFF", "manager-a");
    const cashierA_A = await member(tA.uuid, cashierA.uuid, "STAFF", "cashier-a");
    await member(tA.uuid, customerA.uuid, "STAFF", "customer-a");

    const a1 = await store(tA.uuid, "A1");
    const a2 = await store(tA.uuid, "A2");
    const b1 = await store(tB.uuid, "B1");
    await assign(managerA.uuid, managerA_A.uuid, tA.uuid, a1.uuid, "MANAGER");
    await assign(cashierA.uuid, cashierA_A.uuid, tA.uuid, a1.uuid, "CASHIER");

    const token = (u: { uuid: string; globalRole: string; tokenVersion: number }, tenantUuid: string) =>
        signAccessToken({ userUuid: u.uuid, role: u.globalRole as any, tenantUuid, tokenVersion: u.tokenVersion });
    const t = {
        ownerA: token(ownerA, tA.uuid),
        ownerB: token(ownerB, tB.uuid),
        managerA: token(managerA, tA.uuid),
        cashierA: token(cashierA, tA.uuid),
        customerA: token(customerA, tA.uuid),
        superAdmin: token(superAdmin, tA.uuid),
    };

    // Mounted at the paths server.ts uses
    const app = express();
    app.use(express.json());
    app.use("/api/dashboards/store", storeDashboardRoutes);
    app.use("/api/dashboards/tenant", tenantDashboardRoutes);
    app.use("/api/dashboards/staff", staffDashboardRoutes);
    app.use("/api/admin/dashboard", superAdminDashboardRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const call = async (path: string, bearer?: string) => {
        const res = await fetch(base + path, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    };
    const status = async (path: string, bearer?: string) => (await call(path, bearer)).status;

    try {
        console.log("1. Dashboard routes");
        const serverTs = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
        for (const [path, name] of [
            ["/api/dashboards/store", "storeDashboardRoutes"],
            ["/api/dashboards/tenant", "tenantDashboardRoutes"],
            ["/api/dashboards/staff", "staffDashboardRoutes"],
            ["/api/admin/dashboard", "superAdminDashboardRoutes"],
        ]) {
            check(`server.ts mounts ${path}`, serverTs.includes(`app.use("${path}", ${name});`), true);
        }

        const s = (storeUuid: string, view: string) => `/api/dashboards/store/${storeUuid}/${view}`;
        check("store overview, no token", await status(s(a1.uuid, "overview")), 401);
        check("store overview, tenant owner", await status(s(a1.uuid, "overview"), t.ownerA), 200);
        check("store overview, manager at that store", await status(s(a1.uuid, "overview"), t.managerA), 200);
        check("store overview, manager at another store of the tenant", await status(s(a2.uuid, "overview"), t.managerA), 403);
        check("store overview, cashier", await status(s(a1.uuid, "overview"), t.cashierA), 403);
        check("store staff performance, manager", await status(s(a1.uuid, "staff"), t.managerA), 200);
        check("store active orders, cashier at that store", await status(s(a1.uuid, "active-orders"), t.cashierA), 200);
        check("store peak hours, cashier at that store", await status(s(a1.uuid, "peak-hours"), t.cashierA), 200);
        check("store active orders, tenant member with no store role", await status(s(a1.uuid, "active-orders"), t.customerA), 403);
        check("store overview, other tenant's owner names our store", await status(s(a1.uuid, "overview"), t.ownerB), 404);
        check("store overview, our owner names the other tenant's store", await status(s(b1.uuid, "overview"), t.ownerA), 404);

        check("tenant overview, tenant owner", await status("/api/dashboards/tenant/overview", t.ownerA), 200);
        check("tenant subscription, tenant owner", await status("/api/dashboards/tenant/subscription", t.ownerA), 200);
        check("tenant overview, store manager", await status("/api/dashboards/tenant/overview", t.managerA), 403);

        const me = await call(`/api/dashboards/staff/stores/${a1.uuid}/me`, t.cashierA);
        check("staff dashboard, cashier at that store", me.status, 200);
        check("  ...it is the caller's own (not clocked in)", me.body?.data?.isClockedIn, false);
        check("staff dashboard, cashier at a store they don't work at", await status(`/api/dashboards/staff/stores/${a2.uuid}/me`, t.cashierA), 403);

        check("admin dashboard overview, super admin", await status("/api/admin/dashboard/overview", t.superAdmin), 200);
        check("admin dashboard tenant list, super admin", await status("/api/admin/dashboard/tenant-list", t.superAdmin), 200);
        check("admin dashboard overview, tenant owner", await status("/api/admin/dashboard/overview", t.ownerA), 403);
    } finally {
        server.close();
    }

    console.log("\n2. Live metrics on the store's local day");
    // Auckland is UTC+12/13 and Los Angeles UTC-7/8: for most of the UTC day
    // at least one of them is on a different calendar date than the server
    const nz = await store(tA.uuid, "Auckland", "Pacific/Auckland");
    const la = await store(tA.uuid, "LosAngeles", "America/Los_Angeles");
    for (const st of [nz, la]) {
        await StoreDailyMetricsService.recordPayment({
            tenantUuid: tA.uuid, storeUuid: st.uuid, amount: 1000, paymentMethod: "CASH", paymentFlow: "CASHIER",
        });
        await StoreDailyMetricsService.recordFailedPayment(tA.uuid, st.uuid);
        const localDate = dayjs().tz(st.timezone!).format("YYYY-MM-DD");
        const rows = await prisma.storeDailyMetrics.findMany({ where: { storeUuid: st.uuid } });
        check(`${st.timezone}: one row`, rows.length, 1);
        check(`  ...keyed on the store's local date (${localDate})`, dayjs.utc(rows[0]?.date).format("YYYY-MM-DD"), localDate);
        check("  ...payment and failure on the same row", `${rows[0]?.revenueGross} ${rows[0]?.paymentsFailed}`, "1000 1");
        check("  ...getToday finds it", (await StoreDailyMetricsService.getToday(tA.uuid, st.uuid))?.uuid, rows[0]?.uuid);
    }
    const summary = await StoreDailyMetricsService.getTenantSummary(tA.uuid);
    check("tenant summary: each store's own today", summary.totals.revenueGross, 2000);
    check("  ...per-store local dates", summary.byStore.map((b) => b.date).sort().join(","),
        [nz, la].map((st) => dayjs().tz(st.timezone!).format("YYYY-MM-DD")).sort().join(","));

    console.log("\n3. Alert jobs: oldest first, newer ones reached next run");
    const stuckStore = await store(tA.uuid, "Stuck");
    // 55 orders paid 2-56 hours ago: more than one run's 50 new alerts
    const stuck = [];
    for (let i = 0; i < 55; i++) stuck.push(await order(tA.uuid, stuckStore.uuid, ownerA_A.uuid, "PAID", 120 + i * 60));
    const oldestFirst = [...stuck].reverse().map((o) => o.uuid);

    await DetectStuckOrdersJob.run({ storeUuids: [stuckStore.uuid] });
    let alerted = await alertedOrders(tA.uuid, "ORDER_STUCK:");
    check("stuck orders, run 1: alerts raised", alerted.size, 50);
    check("  ...for the 50 oldest", oldestFirst.slice(0, 50).every((u) => alerted.has(u)), true);
    check("  ...not the 5 newest yet", oldestFirst.slice(50).some((u) => alerted.has(u)), false);

    await DetectStuckOrdersJob.run({ storeUuids: [stuckStore.uuid] });
    alerted = await alertedOrders(tA.uuid, "ORDER_STUCK:");
    check("stuck orders, run 2: the 5 newer ones reached", alerted.size, 55);
    check("  ...the first 50 not re-alerted",
        await prisma.adminAlert.count({ where: { tenantUuid: tA.uuid, groupKey: { startsWith: "ORDER_STUCK:" } } }), 55);

    const prepStore = await store(tA.uuid, "Prep");
    const prep = [];
    for (let i = 0; i < 53; i++) prep.push(await order(tA.uuid, prepStore.uuid, ownerA_A.uuid, "PREPARING", 40 + i * 10));
    const prepOldest = [...prep].reverse().map((o) => o.uuid);
    await OrderTimeoutAlertJob.run({ storeUuids: [prepStore.uuid] });
    let delayed = await alertedOrders(tA.uuid, "ORDER_PREPARATION_DELAYED:");
    check("delayed preparation, run 1: the 50 oldest", delayed.size === 50 && prepOldest.slice(0, 50).every((u) => delayed.has(u)), true);
    await OrderTimeoutAlertJob.run({ storeUuids: [prepStore.uuid] });
    delayed = await alertedOrders(tA.uuid, "ORDER_PREPARATION_DELAYED:");
    check("delayed preparation, run 2: the rest reached", delayed.size, 53);

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-analytics-routing failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        fakeUpstash?.close();
        await prisma.$disconnect();
    });
