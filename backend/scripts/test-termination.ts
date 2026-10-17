// LOCAL TERMINATION / ACCESS-REVOCATION CHECKS
// Real Express + DashboardSocket on loopback, real tokens; sockets are opened
// with a raw WebSocket speaking the Socket.IO v4 protocol (no client library
// needed):
//
//   1. Before: the manager's token works over HTTP and opens a socket.
//   2. terminateStaff: their socket is dropped, the old token fails over HTTP
//      and on a socket reconnect, refresh tokens and sessions are revoked,
//      membership and every store assignment in the tenant are inactive,
//      their open time entry (and break) is clocked out and flagged, their
//      open drawer is out of service for a count (RECONCILING + approval),
//      future shifts are cancelled. Their membership at another tenant and
//      the global User row are untouched.
//   3. removeStaff over HTTP (DELETE /api/tenant/staff/:uuid) does the same.
//   4. Someone removed before this fix (membership inactive, store
//      assignment still active) can't authorise a void or log in by PIN.
//   5. A future termination date is refused.
//
//   npx tsx scripts/test-termination.ts
//
// Each run creates its own users, tenants and stores.
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: express } = await import("express");
const { default: bcrypt } = await import("bcrypt");
const { WebSocket } = await import("ws");
const { default: prisma } = await import("../src/config/prisma.ts");
const { signAccessToken } = await import("../src/utils/jwt.ts");
const { authenticate } = await import("../src/middlewares/auth.middleware.ts");
const { default: tenantRoutes } = await import("../src/routes/tenant/tenant.routes.ts");
const { DashboardSocket } = await import("../src/websockets/DashboardSocket.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { StaffManagementService } = await import("../src/services/staff/StaffManagement.service.ts");
const { CashierPaymentService } = await import("../src/services/payment/cashier/payment.cashier.service.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}
const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];
const settle = <T>(p: Promise<T>) => p.then(() => "ok", (e) => errorCode(e));

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1666${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

// Each person their own PIN: PIN login matches whoever at the store has it
const PINS = new Map<string, string>();
async function person(name: string) {
    const pin = String(1000 + PINS.size * 7 + 13).padStart(4, "0");
    const user = await prisma.user.create({
        data: { phoneNumber: phone(), firstName: name, lastName: "Term", pinHash: await bcrypt.hash(pin, 10) },
    });
    PINS.set(user.uuid, pin);
    return user;
}
async function tenant(label: string, ownerUuid: string) {
    const t = await prisma.tenant.create({
        data: { name: `Term ${label} ${runId}`, slug: `term-${label.toLowerCase()}-${runId}`, email: `${label}@term.test`, ownerUuid },
    });
    const plan = await prisma.plan.create({ data: { name: `Term ${label} ${runId}`, slug: `term-${label.toLowerCase()}-${runId}` } });
    await prisma.planVersion.create({ data: { planUuid: plan.uuid, version: 1, priceMonthly: 0, features: {} } });
    await prisma.planPrice.create({ data: { planUuid: plan.uuid, interval: "MONTHLY", amount: 0 } });
    await SubscriptionService.createSubscription({ tenantUuid: t.uuid, planUuid: plan.uuid, interval: "MONTHLY" });
    return t;
}
const store = (tenantUuid: string, label: string) => prisma.store.create({
    data: { tenantUuid, name: `Term ${label}`, slug: `term-${label.toLowerCase()}-${runId}-${seq++}`, city: "Mogadishu" },
});
const member = (tenantUuid: string, userUuid: string, role: "TENANT_ADMIN" | "STAFF") =>
    prisma.tenantUser.create({ data: { tenantUuid, userUuid, role, slug: `term-${runId}-${seq++}` } });
const assign = (tenantUuid: string, userUuid: string, tenantUserUuid: string, storeUuid: string, role: "ADMIN" | "MANAGER" | "CASHIER") =>
    prisma.userStore.create({ data: { tenantUuid, userUuid, tenantUserUuid, storeUuid, role, canOpenDrawer: true } });
const token = (u: { uuid: string; tokenVersion: number }, tenantUuid: string) =>
    signAccessToken({ userUuid: u.uuid, role: "CUSTOMER" as any, tenantUuid, tokenVersion: u.tokenVersion });

// The manager's working state: open shift, break, drawer with a cash sale,
// tokens, a future shift; plus a membership at a second tenant
async function workingState(tenantUuid: string, storeUuid: string, userUuid: string) {
    const clockIn = new Date(Date.now() - 3 * 3_600_000);
    const entry = await prisma.timeEntry.create({
        data: { tenantUuid, storeUuid, userUuid, clockInAt: clockIn, clockInDevice: "test", payRate: 2000 },
    });
    await prisma.breakEntry.create({ data: { timeEntryUuid: entry.uuid, breakStart: new Date(Date.now() - 600_000), breakType: "UNPAID" } });
    const drawer = await prisma.cashDrawer.create({
        data: { tenantUuid, storeUuid, userUuid, status: "OPEN", openedAt: new Date(), openedBy: userUuid, startingCash: 10_000, terminalId: `term-${runId}-${seq++}` },
    });
    const order = await prisma.order.create({
        data: {
            tenantUuid, storeUuid, tenantUserUuid: (await prisma.tenantUser.findFirstOrThrow({ where: { tenantUuid, userUuid } })).uuid,
            orderNumber: `TERM-${runId}-${seq++}`, status: "PAID", paymentStatus: "COMPLETED",
            subtotal: 500, totalAmount: 500, menuVersion: 1, pricingSnapshot: {},
        },
    });
    const payment = await prisma.payment.create({
        data: {
            orderUuid: order.uuid, tenantUuid, storeUuid, amount: 500, currency: "USD", subtotal: 500, tax: 0, discount: 0,
            paymentFlow: "CASHIER", paymentMethod: "CASH", status: "COMPLETED", processedAt: new Date(),
            drawerUuid: drawer.uuid, snapshot: {}, orderSnapshot: {}, pricingRules: {},
        },
    });
    const family = crypto.randomUUID();
    const refresh = await prisma.refreshToken.create({
        data: { token: crypto.randomBytes(24).toString("hex"), userUuid, tenantUuid, tokenFamily: family, expiresAt: new Date(Date.now() + 86_400_000), issuedFrom: "test", deviceFingerprint: "test" },
    });
    await prisma.session.create({
        data: { userUuid, tenantUuid, refreshTokenUuid: refresh.uuid, deviceId: "test", deviceFingerprint: "test", ipAddress: "127.0.0.1", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const future = await prisma.shift.create({
        data: { tenantUuid, storeUuid, userUuid, role: "MANAGER", scheduledStart: new Date(Date.now() + 86_400_000), scheduledEnd: new Date(Date.now() + 90_000_000) },
    });
    return { entry, drawer, payment, future };
}

// A raw Socket.IO v4 client over WebSocket: "0" open, "40{auth}" connect,
// server answers "40" (connected) or "44" (refused); "41" or a close is a
// disconnect; "2" ping -> "3" pong
function openSocket(wsBase: string, accessToken: string) {
    const ws = new WebSocket(`${wsBase}/socket.io/dashboard/?EIO=4&transport=websocket`);
    let disconnected = false;
    const dropped = new Promise<void>((resolve) => {
        ws.on("close", () => { disconnected = true; resolve(); });
        ws.on("message", (d) => { if (d.toString() === "41") { disconnected = true; resolve(); } });
    });
    const outcome = new Promise<"connected" | "refused" | "timeout">((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 5000);
        ws.on("message", (d) => {
            const m = d.toString();
            if (m.startsWith("0")) ws.send(`40${JSON.stringify({ token: accessToken })}`);
            else if (m === "2") ws.send("3");
            else if (m.startsWith("40")) { clearTimeout(timer); resolve("connected"); }
            else if (m.startsWith("44")) { clearTimeout(timer); resolve("refused"); }
        });
        ws.on("error", () => { clearTimeout(timer); resolve("refused"); });
    });
    return {
        outcome,
        dropped: (ms: number) => Promise.race([dropped.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(disconnected), ms))]),
        close: () => ws.close(),
    };
}

const servers: Array<{ close: () => void }> = [];
const sockets: Array<{ close: () => void }> = [];
try {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await person("Owner");
    const tA = await tenant("A", owner.uuid);
    const ownerA = await member(tA.uuid, owner.uuid, "TENANT_ADMIN");
    const a1 = await store(tA.uuid, "A1");
    const a2 = await store(tA.uuid, "A2");
    await assign(tA.uuid, owner.uuid, ownerA.uuid, a1.uuid, "ADMIN");

    const manager = await person("Manager");
    const managerA = await member(tA.uuid, manager.uuid, "STAFF");
    await assign(tA.uuid, manager.uuid, managerA.uuid, a1.uuid, "MANAGER");
    await assign(tA.uuid, manager.uuid, managerA.uuid, a2.uuid, "MANAGER");
    const work = await workingState(tA.uuid, a1.uuid, manager.uuid);

    // The manager also works for tenant B
    const ownerB = await person("OwnerB");
    const tB = await tenant("B", ownerB.uuid);
    const b1 = await store(tB.uuid, "B1");
    const managerB = await member(tB.uuid, manager.uuid, "STAFF");
    await assign(tB.uuid, manager.uuid, managerB.uuid, b1.uuid, "CASHIER");

    const app = express();
    app.use(express.json());
    app.get("/probe", authenticate, (_req, res) => res.json({ ok: true }));
    app.use("/api/tenant", tenantRoutes);
    const server = http.createServer(app);
    new DashboardSocket(server);
    server.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const wsBase = `ws://127.0.0.1:${port}`;
    const probe = async (t: string) => (await fetch(`${base}/probe`, { headers: { Authorization: `Bearer ${t}` } })).status;

    console.log("\n1. Before termination");
    const managerToken = token(manager, tA.uuid);
    check("HTTP with the manager's token", await probe(managerToken), 200);
    const live = openSocket(wsBase, managerToken);
    sockets.push(live);
    check("socket with the manager's token", await live.outcome, "connected");

    console.log("\n2. terminateStaff");
    const revoked = await StaffManagementService.terminateStaff({
        userUuid: manager.uuid, tenantUuid: tA.uuid, reason: "test", terminatedBy: owner.uuid,
    });
    check("open socket dropped", await live.dropped(3000), true);
    check("old token over HTTP", await probe(managerToken), 401);
    const again = openSocket(wsBase, managerToken);
    sockets.push(again);
    check("socket reconnect with the old token", await again.outcome, "refused");

    const after = await prisma.user.findUniqueOrThrow({ where: { uuid: manager.uuid } });
    check("tokenVersion bumped", after.tokenVersion, manager.tokenVersion + 1);
    check("global employmentStatus untouched", after.employmentStatus, manager.employmentStatus);
    check("refresh tokens revoked", await prisma.refreshToken.count({ where: { userUuid: manager.uuid, status: "ACTIVE" } }), 0);
    check("sessions revoked", await prisma.session.count({ where: { userUuid: manager.uuid, status: "ACTIVE" } }), 0);
    check("tenant A membership", (await prisma.tenantUser.findUniqueOrThrow({ where: { uuid: managerA.uuid } })).isActive, false);
    check("tenant A store assignments still active", await prisma.userStore.count({ where: { tenantUuid: tA.uuid, userUuid: manager.uuid, isActive: true } }), 0);
    check("  ...revocation reports both", revoked.storeAssignmentsRevoked, 2);
    check("tenant B membership untouched", (await prisma.tenantUser.findUniqueOrThrow({ where: { uuid: managerB.uuid } })).isActive, true);
    check("tenant B store assignment untouched", await prisma.userStore.count({ where: { tenantUuid: tB.uuid, userUuid: manager.uuid, isActive: true } }), 1);

    const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { uuid: work.entry.uuid } });
    check("time entry clocked out", entry.clockOutAt !== null, true);
    check("  ...flagged for approval", entry.requiresApproval, true);
    check("  ...about 3 hours", Math.round(entry.hoursWorked ?? 0), 3);
    check("  ...open break ended", await prisma.breakEntry.count({ where: { timeEntryUuid: entry.uuid, breakEnd: null } }), 0);

    const drawer = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: work.drawer.uuid } });
    check("drawer out of service", drawer.status, "RECONCILING");
    check("  ...expected cash (start + cash sale)", drawer.expectedCash, 10_500);
    check("  ...not counted", `${drawer.actualCash} ${drawer.variance}`, "null null");
    check("  ...note", drawer.notes?.startsWith("Auto-closed due to termination"), true);
    const approval = await prisma.staffApprovalRequest.findFirst({
        where: { tenantUuid: tA.uuid, approvalType: "CASH_VARIANCE", requestData: { path: ["drawerUuid"], equals: drawer.uuid } },
    });
    check("  ...count requested (CASH_VARIANCE)", approval?.status, "PENDING");
    check("future shift cancelled", (await prisma.shift.findUniqueOrThrow({ where: { uuid: work.future.uuid } })).status, "CANCELLED");

    console.log("\n3. removeStaff over HTTP");
    const cashier = await person("Cashier");
    const cashierA = await member(tA.uuid, cashier.uuid, "STAFF");
    await assign(tA.uuid, cashier.uuid, cashierA.uuid, a1.uuid, "CASHIER");
    const cashierToken = token(cashier, tA.uuid);
    const cashierSocket = openSocket(wsBase, cashierToken);
    sockets.push(cashierSocket);
    check("cashier socket before", await cashierSocket.outcome, "connected");
    const ownerFresh = await prisma.user.findUniqueOrThrow({ where: { uuid: owner.uuid } });
    const removal = await fetch(`${base}/api/tenant/staff/${cashierA.uuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token(ownerFresh, tA.uuid)}`, "x-tenant-uuid": tA.uuid },
    });
    check("DELETE /api/tenant/staff/:uuid", removal.status, 200);
    check("  ...cashier socket dropped", await cashierSocket.dropped(3000), true);
    check("  ...cashier token over HTTP", await probe(cashierToken), 401);
    check("  ...store assignment inactive", await prisma.userStore.count({ where: { userUuid: cashier.uuid, isActive: true } }), 0);

    console.log("\n4. Removed before this fix (store assignment left active)");
    const legacy = await person("Legacy");
    const legacyA = await member(tA.uuid, legacy.uuid, "STAFF");
    await assign(tA.uuid, legacy.uuid, legacyA.uuid, a1.uuid, "MANAGER");
    await prisma.tenantUser.update({ where: { uuid: legacyA.uuid }, data: { isActive: false } }); // the old removeStaff
    check("authorises a void", await settle(CashierPaymentService.voidPayment({
        tenantUuid: tA.uuid, paymentUuid: work.payment.uuid, voidedBy: owner.uuid,
        voidReason: "Customer changed their mind at the counter", managerPin: PINS.get(legacy.uuid)!, managerUuid: legacy.uuid,
    })), "INSUFFICIENT_ROLE_FOR_VOID");
    check("  ...payment untouched", (await prisma.payment.findUniqueOrThrow({ where: { uuid: work.payment.uuid } })).status, "COMPLETED");
    check("PIN login at the store", await settle(StaffManagementService.authenticateWithPIN({ pin: PINS.get(legacy.uuid)!, storeUuid: a1.uuid, deviceId: "test" })), "INVALID_PIN");
    check("  ...a current member's PIN still works", await settle(StaffManagementService.authenticateWithPIN({ pin: PINS.get(owner.uuid)!, storeUuid: a1.uuid, deviceId: "test" })), "ok");

    console.log("\n5. Future termination date");
    check("terminate with a date next week", await settle(StaffManagementService.terminateStaff({
        userUuid: owner.uuid, tenantUuid: tA.uuid, terminationDate: new Date(Date.now() + 7 * 86_400_000), terminatedBy: owner.uuid,
    })), "TERMINATION_DATE_IN_FUTURE");

    console.log(failures === 0 ? "\nAll termination checks passed" : `\n${failures} check(s) FAILED`);
} catch (error) {
    console.error("\nTermination test crashed:", error);
    failures++;
} finally {
    for (const s of sockets) s.close();
    for (const s of servers) s.close();
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(failures === 0 ? 0 : 1);
