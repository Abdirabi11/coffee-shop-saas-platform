// LOCAL ADMIN SECURITY CHECKS (Phase 28)
// Mounts the real webhook, staff and financial routers in a throwaway Express
// app and calls them over HTTP with real signed access tokens. Every run
// creates two fresh tenants (A with stores A1/A2, B with store B1).
//
// Covers:
//   - SSRF: private, loopback, link-local/metadata and reserved addresses are
//     refused when a webhook URL is saved and again at connect time (so DNS
//     rebinding and stored URLs are caught); redirects are never followed
//   - webhooks: every lookup is tenant-scoped (another tenant's webhook is a
//     404 and unchanged); the signing secret isn't returned on reads
//   - payroll: approve/export checked at the period's own store, tenant
//     scoped, export only once approved, approved periods can't be
//     recalculated
//   - dashboard socket: customers and store staff can't join the tenant room;
//     super admin comes from the database, not the token claim
//   - CSV reports: no require() (crashes the ES-module build), temp file deleted
//
//   npx tsx scripts/test-admin-security.ts
//
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: express } = await import("express");
const { default: prisma } = await import("../src/config/prisma.ts");
const { signAccessToken } = await import("../src/utils/jwt.ts");
const { default: webhookRoutes } = await import("../src/routes/webhooks/webhook.routes.ts");
const { default: staffRoutes } = await import("../src/routes/staff/staff.routes.ts");
const { default: financialRoutes } = await import("../src/routes/payment/Financial.routes.ts");
// Modules added in Phase 28: optional, so this script also runs against the
// old code (those sections then fail instead of crashing the run)
const safeHttp = await import("../src/infrastructure/http/safeOutboundRequest.ts" as string).catch(() => null);
const socketModule = await import("../src/websockets/DashboardSocket.ts").catch(() => null);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let phoneSeq = 0;
const user = (name: string, globalRole: "ADMIN" | "CUSTOMER") => prisma.user.create({
    data: { phoneNumber: `+1998${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, "0")}`, firstName: name, lastName: "P28", globalRole },
});
const tenant = (label: string, ownerUuid: string) => prisma.tenant.create({
    data: { name: `P28 ${label} ${runId}`, slug: `p28-${label.toLowerCase()}-${runId}`, email: `${label}@p28.test`, ownerUuid },
});
const member = (tenantUuid: string, userUuid: string, role: "TENANT_ADMIN" | "STAFF", slug: string) =>
    prisma.tenantUser.create({ data: { tenantUuid, userUuid, role, slug: `${slug}-${runId}` } });
const store = (tenantUuid: string, label: string) => prisma.store.create({
    data: { tenantUuid, name: `P28 ${label} ${runId}`, slug: `p28-${label.toLowerCase()}-${runId}`, city: "Mogadishu" },
});

// A local HTTP server standing in for an internal service; counts hits
function internalServer(handler?: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    let hits = 0;
    const server = http.createServer((req, res) => {
        hits++;
        if (handler) return handler(req, res);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("internal-secret");
    });
    server.listen(0, "127.0.0.1");
    return {
        server,
        get hits() { return hits; },
        get port() { return (server.address() as AddressInfo).port; },
    };
}

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    const ownerA = await user("OwnerA", "ADMIN");
    const ownerB = await user("OwnerB", "ADMIN");
    const adminA = await user("TenantAdminA", "CUSTOMER");
    const managerA = await user("ManagerA", "CUSTOMER");
    const cashierA = await user("CashierA", "CUSTOMER");
    const customerA = await user("CustomerA", "CUSTOMER");

    const tA = await tenant("A", ownerA.uuid);
    const tB = await tenant("B", ownerB.uuid);
    const ownerA_A = await member(tA.uuid, ownerA.uuid, "TENANT_ADMIN", "owner-a");
    await member(tB.uuid, ownerB.uuid, "TENANT_ADMIN", "owner-b");
    await member(tA.uuid, adminA.uuid, "TENANT_ADMIN", "admin-a");
    const managerA_A = await member(tA.uuid, managerA.uuid, "STAFF", "manager-a");
    const cashierA_A = await member(tA.uuid, cashierA.uuid, "STAFF", "cashier-a");
    await member(tA.uuid, customerA.uuid, "STAFF", "customer-a");   // customers are plain members

    const a1 = await store(tA.uuid, "A1");
    const a2 = await store(tA.uuid, "A2");
    const b1 = await store(tB.uuid, "B1");
    await prisma.userStore.create({ data: { userUuid: ownerA.uuid, tenantUserUuid: ownerA_A.uuid, tenantUuid: tA.uuid, storeUuid: a1.uuid, role: "ADMIN" } });
    await prisma.userStore.create({ data: { userUuid: managerA.uuid, tenantUserUuid: managerA_A.uuid, tenantUuid: tA.uuid, storeUuid: a1.uuid, role: "MANAGER" } });
    await prisma.userStore.create({ data: { userUuid: cashierA.uuid, tenantUserUuid: cashierA_A.uuid, tenantUuid: tA.uuid, storeUuid: a1.uuid, role: "CASHIER" } });

    // Payroll permissions aren't in any default role: grant them at A1 only
    for (const slug of ["payroll.calculate", "payroll.approve", "payroll.export"]) {
        const [resource, action] = slug.split(".");
        const perm = await prisma.permission.upsert({ where: { slug }, update: {}, create: { slug, resource, action, name: slug } });
        await prisma.userPermission.create({ data: { userUuid: managerA.uuid, storeUuid: a1.uuid, permissionUuid: perm.uuid, grantedBy: ownerA.uuid } });
    }

    const webhook = (tenantUuid: string, url: string, createdBy: string) => {
        const secret = crypto.randomBytes(32).toString("hex");
        return prisma.webhook.create({
            data: {
                tenantUuid, name: `hook-${crypto.randomBytes(3).toString("hex")}`, url, secret,
                secretHash: crypto.createHash("sha256").update(secret).digest("hex"),
                eventTypes: ["ORDER_CREATED"], createdBy,
            },
        });
    };
    const hookA = await webhook(tA.uuid, "https://93.184.215.14/a", ownerA.uuid);
    const hookB = await webhook(tB.uuid, "https://93.184.215.14/b", ownerB.uuid);
    const payload = { order: { customer: "Tenant B customer", total: 4200 } };
    await prisma.webhookDelivery.create({
        data: {
            tenantUuid: tB.uuid, webhookUuid: hookB.uuid, eventType: "ORDER_CREATED", eventUuid: crypto.randomUUID(),
            eventSource: "test", payload, payloadSize: JSON.stringify(payload).length, targetUrl: hookB.url,
            signature: "sig", requestUrl: hookB.url, requestHeaders: {}, requestBody: payload,
        },
    });

    const period = (tenantUuid: string, storeUuid: string | null, start: string, status: "CALCULATED" | "APPROVED") =>
        prisma.payrollPeriod.create({
            data: {
                tenantUuid, storeUuid, periodStart: new Date(start), periodEnd: new Date(new Date(start).getTime() + 13 * 86400000),
                periodType: "BIWEEKLY", status, totalGrossPay: 123456,
            },
        });
    const periods = {
        a1Calculated: await period(tA.uuid, a1.uuid, "2031-01-01T00:00:00.000Z", "CALCULATED"),
        a1Approved: await period(tA.uuid, a1.uuid, "2031-01-15T00:00:00.000Z", "APPROVED"),
        a2Approved: await period(tA.uuid, a2.uuid, "2031-02-01T00:00:00.000Z", "APPROVED"),
        aTenantWide: await period(tA.uuid, null, "2031-02-15T00:00:00.000Z", "APPROVED"),
        bApproved: await period(tB.uuid, b1.uuid, "2031-01-01T00:00:00.000Z", "APPROVED"),
    };

    const token = (u: { uuid: string; globalRole: string; tokenVersion: number }, tenantUuid: string, roleClaim?: string) =>
        signAccessToken({ userUuid: u.uuid, role: (roleClaim ?? u.globalRole) as any, tenantUuid, tokenVersion: u.tokenVersion });

    return {
        tA, tB, a1, a2, b1, hookA, hookB, periods,
        users: { ownerA, ownerB, adminA, managerA, cashierA, customerA },
        tokens: {
            ownerA: token(ownerA, tA.uuid),
            managerA: token(managerA, tA.uuid),
            customerA: token(customerA, tA.uuid),
        },
        token,
    };
}

async function main() {
    const ctx = await setup();
    const { tokens: t, users: u, periods: p } = ctx;
    const a1 = ctx.a1.uuid;

    const app = express();
    app.use(express.json());
    app.use("/api/webhooks", webhookRoutes);
    app.use("/api/staff", staffRoutes);
    app.use("/api/financial", financialRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const call = async (method: string, urlPath: string, token: string, body?: unknown) => {
        const res = await fetch(base + urlPath, {
            method,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* CSV */ }
        return { status: res.status, body: json, text, contentType: res.headers.get("content-type") ?? "" };
    };
    const errorOf = async (...args: Parameters<typeof call>) => {
        const r = await call(...args);
        return `${r.status} ${r.body?.error ?? ""}`.trim();
    };

    const internal = internalServer();
    await new Promise((resolve) => internal.server.once("listening", resolve));

    try {
        console.log("\n=== SSRF: blocked addresses ===");
        if (!safeHttp) {
            check("safe outbound request module", "missing", "present");
        } else {
            const blocked = [
                "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
                "0.0.0.0", "100.64.0.1", "::1", "::", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "fd00::1", "fe80::1",
            ];
            const notBlocked = blocked.filter((ip) => !safeHttp.isBlockedAddress(ip));
            check("private, loopback, metadata and reserved addresses blocked", notBlocked.join(",") || "all", "all");
            const allowed = ["8.8.8.8", "172.32.0.1", "93.184.215.14", "2606:4700:4700::1111"].filter((ip) => safeHttp.isBlockedAddress(ip));
            check("public addresses allowed", allowed.join(",") || "all", "all");

            const rejects = async (url: string) => {
                try { await safeHttp.validateOutboundUrl(url); return "accepted"; }
                catch (e: any) { return e instanceof safeHttp.OutboundUrlError ? "rejected" : `error: ${e.message}`; }
            };
            for (const url of [
                "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
                "http://127.0.0.1/", "http://localhost:6379/", "http://[::1]/", "http://0.0.0.0/",
                "http://2130706433/", "http://0x7f.1/", "http://10.0.0.5/admin", "http://[::ffff:a9fe:a9fe]/",
                "https://user:pass@93.184.215.14/", "ftp://93.184.215.14/", "not a url",
            ]) {
                check(`URL rejected: ${url}`, await rejects(url), "rejected");
            }
            check("public IP URL accepted", await rejects("https://93.184.215.14/hook"), "accepted");

            console.log("\n=== SSRF: enforced at connect time, no redirects ===");
            const send = (url: string, isBlocked?: (ip: string) => boolean) =>
                safeHttp.sendOutboundRequest({ url, body: "{}", timeoutMs: 3000, isBlocked })
                    .then((r: any) => `${r.status}`)
                    .catch((e: any) => e instanceof safeHttp.OutboundUrlError ? "refused" : `error: ${e.message}`);
            check("send to 127.0.0.1", await send(`http://127.0.0.1:${internal.port}/`), "refused");
            // A hostname is only resolved at connect time: same as a DNS name
            // that resolved to a public IP when saved and to loopback now
            check("send to a hostname resolving to loopback", await send(`http://localhost:${internal.port}/`), "refused");
            check("  ...internal server never reached", internal.hits, 0);

            // Redirect to the internal server. The redirecting endpoint is
            // local too, so allow loopback for this check only
            const target = internalServer();
            await new Promise((resolve) => target.server.once("listening", resolve));
            const redirector = internalServer((_req, res) => {
                res.writeHead(302, { Location: `http://127.0.0.1:${target.port}/latest/meta-data/` });
                res.end();
            });
            await new Promise((resolve) => redirector.server.once("listening", resolve));
            const viaRedirect = await safeHttp.sendOutboundRequest({ url: `http://127.0.0.1:${redirector.port}/`, body: "{}", isBlocked: () => false });
            check("redirect returned as a failure", `${viaRedirect.status} ok=${viaRedirect.ok}`, "302 ok=false");
            check("  ...redirect target never reached", target.hits, 0);
            await fetch(`http://127.0.0.1:${redirector.port}/`).catch(() => null);
            check("  (plain fetch, the old client, follows it)", target.hits, 1);
            target.server.close();
            redirector.server.close();
        }

        console.log("\n=== Webhooks: SSRF through the API ===");
        const metadata = await errorOf("POST", "/api/webhooks", t.ownerA, { url: "http://169.254.169.254/latest/meta-data/", events: ["ORDER_CREATED"] });
        check("create pointing at cloud metadata", metadata, "400 INVALID_WEBHOOK_URL");
        check("create pointing at the internal server",
            await errorOf("POST", "/api/webhooks", t.ownerA, { url: `http://127.0.0.1:${internal.port}/`, events: ["ORDER_CREATED"] }), "400 INVALID_WEBHOOK_URL");
        check("create for tenant B's store",
            await errorOf("POST", "/api/webhooks", t.ownerA, { url: "https://93.184.215.14/x", events: ["ORDER_CREATED"], storeUuid: ctx.b1.uuid }), "404 STORE_NOT_FOUND");
        const created = await call("POST", "/api/webhooks", t.ownerA, { url: "https://93.184.215.14/new", events: ["ORDER_CREATED"], storeUuid: a1 });
        check("create with a public URL", created.status, 201);
        check("repoint own webhook at 10.0.0.1",
            await errorOf("PATCH", `/api/webhooks/${ctx.hookA.uuid}`, t.ownerA, { url: "http://10.0.0.1/" }), "400 INVALID_WEBHOOK_URL");
        check("  ...URL unchanged", (await prisma.webhook.findUniqueOrThrow({ where: { uuid: ctx.hookA.uuid } })).url, ctx.hookA.url);
        // A URL already stored (or a host that now resolves internally) is
        // caught at send time
        await prisma.webhook.update({ where: { uuid: ctx.hookA.uuid }, data: { url: `http://127.0.0.1:${internal.port}/` } });
        const tested = await call("POST", `/api/webhooks/${ctx.hookA.uuid}/test`, t.ownerA);
        check("test call to a stored internal URL", `${tested.status} success=${tested.body?.result?.success}`, "200 success=false");
        check("  ...internal response not returned", JSON.stringify(tested.body).includes("internal-secret"), false);
        check("  ...internal server never reached", internal.hits, 0);
        await prisma.webhook.update({ where: { uuid: ctx.hookA.uuid }, data: { url: ctx.hookA.url } });

        console.log("\n=== Webhooks: tenant-scoped lookups ===");
        const hookB = ctx.hookB.uuid;
        check("get tenant B's webhook", (await call("GET", `/api/webhooks/${hookB}`, t.ownerA)).status, 404);
        check("repoint tenant B's webhook", (await call("PATCH", `/api/webhooks/${hookB}`, t.ownerA, { url: "https://93.184.215.14/stolen" })).status, 404);
        check("test tenant B's webhook", (await call("POST", `/api/webhooks/${hookB}/test`, t.ownerA)).status, 404);
        check("rotate tenant B's secret", (await call("POST", `/api/webhooks/${hookB}/rotate-secret`, t.ownerA)).status, 404);
        check("read tenant B's deliveries", (await call("GET", `/api/webhooks/${hookB}/deliveries`, t.ownerA)).status, 404);
        check("read tenant B's statistics", (await call("GET", `/api/webhooks/${hookB}/statistics`, t.ownerA)).status, 404);
        check("delete tenant B's webhook", (await call("DELETE", `/api/webhooks/${hookB}`, t.ownerA)).status, 404);
        const bAfter = await prisma.webhook.findUnique({ where: { uuid: hookB } });
        check("  ...tenant B's webhook untouched", `${!!bAfter} ${bAfter?.url === ctx.hookB.url} ${bAfter?.secret === ctx.hookB.secret}`, "true true true");

        const own = await call("GET", `/api/webhooks/${ctx.hookA.uuid}`, t.ownerA);
        check("get own webhook", own.status, 200);
        check("  ...no signing secret in the response", "secret" in (own.body?.webhook ?? {}) || "secretHash" in (own.body?.webhook ?? {}), false);
        const listed = await call("GET", "/api/webhooks", t.ownerA);
        check("list: own webhooks only, no secrets",
            `${listed.body?.webhooks?.every((w: any) => w.tenantUuid === ctx.tA.uuid)} ${listed.body?.webhooks?.some((w: any) => "secret" in w)}`, "true false");
        check("own deliveries", (await call("GET", `/api/webhooks/${ctx.hookA.uuid}/deliveries`, t.ownerA)).status, 200);
        check("own statistics", (await call("GET", `/api/webhooks/${ctx.hookA.uuid}/statistics`, t.ownerA)).status, 200);
        const rotated = await call("POST", `/api/webhooks/${ctx.hookA.uuid}/rotate-secret`, t.ownerA);
        check("rotate own secret", `${rotated.status} ${typeof rotated.body?.webhook?.secret}`, "200 string");
        check("delete own webhook", (await call("DELETE", `/api/webhooks/${created.body?.webhook?.uuid}`, t.ownerA)).status, 200);

        console.log("\n=== Payroll: period's own store, tenant-scoped, approved only ===");
        const exportAs = (token: string, periodUuid: string, query = "", format = "GENERIC_CSV") =>
            call("POST", `/api/staff/payroll/${periodUuid}/export${query}`, token, { format });
        const approveAs = (token: string, periodUuid: string, query = "") =>
            errorOf("POST", `/api/staff/payroll/${periodUuid}/approve${query}`, token);

        check("A1 manager exports tenant B's payroll, naming A1", (await exportAs(t.managerA, p.bApproved.uuid, `?storeUuid=${a1}`)).status, 404);
        check("A1 manager approves tenant B's payroll, naming A1", (await approveAs(t.managerA, p.bApproved.uuid, `?storeUuid=${a1}`)).split(" ")[0], "404");
        check("A1 manager exports an A2 period, naming A1", (await exportAs(t.managerA, p.a2Approved.uuid, `?storeUuid=${a1}`)).status, 403);
        check("A1 manager exports a tenant-wide period", (await exportAs(t.managerA, p.aTenantWide.uuid, `?storeUuid=${a1}`)).status, 403);
        check("owner exports the tenant-wide period", (await exportAs(t.ownerA, p.aTenantWide.uuid)).status, 200);
        const bPeriod = await prisma.payrollPeriod.findUniqueOrThrow({ where: { uuid: p.bApproved.uuid } });
        check("  ...tenant B's period untouched", bPeriod.status, "APPROVED");

        check("export before approval", (await exportAs(t.managerA, p.a1Calculated.uuid)).body?.error, "PAYROLL_NOT_APPROVED");
        check("approve the calculated period", (await approveAs(t.managerA, p.a1Calculated.uuid)).split(" ")[0], "200");
        check("approve it again", await approveAs(t.managerA, p.a1Calculated.uuid), "409 PAYROLL_NOT_CALCULATED");
        const exported = await exportAs(t.managerA, p.a1Calculated.uuid);
        check("export once approved", `${exported.status} ${exported.contentType.split(";")[0]}`, "200 text/csv");
        check("re-export an exported period", (await exportAs(t.managerA, p.a1Calculated.uuid)).status, 200);
        check("unknown export format", (await exportAs(t.managerA, p.a1Approved.uuid, "", "PDF")).body?.error, "UNSUPPORTED_FORMAT");

        const calculate = (start: Date, storeUuid: string) => call("POST", "/api/staff/payroll/calculate", t.managerA, {
            storeUuid, periodStart: start.toISOString(), periodEnd: new Date(start.getTime() + 13 * 86400000).toISOString(), periodType: "BIWEEKLY",
        });
        check("recalculate an approved period", (await calculate(p.a1Approved.periodStart, a1)).body?.error, "PAYROLL_PERIOD_LOCKED");
        check("recalculate the tenant-wide period as A1", (await calculate(p.aTenantWide.periodStart, a1)).body?.error, "PAYROLL_PERIOD_SCOPE_MISMATCH");
        const a1Approved = await prisma.payrollPeriod.findUniqueOrThrow({ where: { uuid: p.a1Approved.uuid } });
        check("  ...approved totals unchanged", `${a1Approved.status} ${a1Approved.totalGrossPay}`, "APPROVED 123456");

        console.log("\n=== Dashboard socket rooms ===");
        if (!socketModule || !("canJoinDashboardRoom" in socketModule)) {
            check("room check exported", "missing", "present");
        } else {
            const can = (userUuid: string, room: string, isSuperAdmin = false) =>
                socketModule.canJoinDashboardRoom({ userUuid, isSuperAdmin }, room);
            const tenantRoom = `tenant:${ctx.tA.uuid}`;
            check("customer joins the tenant room", await can(u.customerA.uuid, tenantRoom), false);
            check("cashier joins the tenant room", await can(u.cashierA.uuid, tenantRoom), false);
            check("cashier joins own store room", await can(u.cashierA.uuid, `store:${a1}`), true);
            check("customer joins a store room", await can(u.customerA.uuid, `store:${a1}`), false);
            check("owner joins the tenant room", await can(u.ownerA.uuid, tenantRoom), true);
            check("tenant admin joins the tenant room", await can(u.adminA.uuid, tenantRoom), true);
            check("tenant admin joins an A2 store room", await can(u.adminA.uuid, `store:${ctx.a2.uuid}`), true);
            check("owner joins tenant B's room", await can(u.ownerA.uuid, `tenant:${ctx.tB.uuid}`), false);
            check("owner joins tenant B's store room", await can(u.ownerA.uuid, `store:${ctx.b1.uuid}`), false);
            check("non-super-admin joins superadmin", await can(u.ownerA.uuid, "superadmin"), false);

            // The handshake middleware decides isSuperAdmin from the database:
            // a token claiming SUPER_ADMIN for a CUSTOMER user doesn't count
            const { DashboardSocket } = socketModule as any;
            const dashboard = new DashboardSocket(http.createServer());
            const middleware = (dashboard as any).io.of("/")._fns?.[0];
            if (!middleware) {
                check("handshake middleware found", false, true);
            } else {
                const forged = ctx.token(u.customerA, ctx.tA.uuid, "SUPER_ADMIN");
                const socket: any = { handshake: { auth: { token: forged } }, data: {} };
                await new Promise<void>((resolve) => middleware(socket, () => resolve()));
                check("token claims SUPER_ADMIN, database says CUSTOMER", socket.data.identity?.isSuperAdmin, false);
                check("  ...superadmin room refused", await socketModule.canJoinDashboardRoom(socket.data.identity ?? { userUuid: u.customerA.uuid, isSuperAdmin: true }, "superadmin"), false);
            }
            (dashboard as any).io.close();
        }

        console.log("\n=== CSV reports ===");
        const source = fs.readFileSync(path.join(import.meta.dirname, "../src/controllers/dashboards/FinancialReport.controller.ts"), "utf8");
        check("report controller calls require()", /\brequire\(/.test(source), false);
        const reportDir = path.join(process.cwd(), "storage", "reports", ctx.tA.uuid);
        const report = await call("POST", "/api/financial/reports/daily-sales", t.ownerA, { from: "2031-01-01", to: "2031-01-31" });
        check("daily sales CSV", `${report.status} ${report.contentType.split(";")[0]}`, "200 text/csv");
        await new Promise((resolve) => setTimeout(resolve, 200));
        const left = fs.existsSync(reportDir) ? fs.readdirSync(reportDir) : [];
        check("  ...temp file deleted after download", left.length, 0);
        fs.rmSync(reportDir, { recursive: true, force: true });
        // Leave no empty storage/reports behind (rmdir only removes empty dirs)
        for (const dir of [path.dirname(reportDir), path.dirname(path.dirname(reportDir))]) {
            try { fs.rmdirSync(dir); } catch { /* not empty or already gone */ }
        }
    } finally {
        server.close();
        internal.server.close();
    }

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-admin-security failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        fakeUpstash?.close();
        await prisma.$disconnect();
    });
