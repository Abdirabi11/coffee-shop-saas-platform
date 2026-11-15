// Receipt emails and the outbox, IP whitelist rules, dispute uniqueness.
//
//   npx tsx scripts/test-emails-ipwhitelist-disputes.ts
//
//   1. IP whitelist: an address or a CIDR range (IPv4/IPv6), never both or
//      neither; IPv4-mapped clients match; cached rules still match; adding
//      or removing a rule applies at once; expired rules don't match
//   2. Disputes: concurrent deliveries of one provider dispute make one row
//      and one alert
//   3. Receipts: one automatic email per payment, none for a staff-entered
//      walk-in order, viewing never emails, resend sends exactly one
//   4. Outbox processor: sends through EmailService (SMTP stubbed), escapes
//      customer input, retries with backoff, fails after maxAttempts,
//      expires stale rows
//
// Creates its own tenant (left behind, tagged with the run id). Local
// databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { CashierPaymentService } = await import("../src/services/payment/cashier/payment.cashier.service.ts");
const { IPWhitelistService } = await import("../src/services/security/IpWhitelist.service.ts");
const { PaymentDisputeService } = await import("../src/services/payment/paymentDispute.service.ts");
const { ReceiptService } = await import("../src/services/payment/Receipt.service.ts");
const { EmailService } = await import("../src/services/notification/Email.service.ts");
const { EmailOutboxProcessorJob } = await import("../src/jobs/emailOutboxProcessor.job.ts");
const { registerReceiptHandlers } = await import("../src/events/receipt.handlers.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}
const errorCode = (e: any) => String(e?.code ?? e?.message ?? e).split(":")[0];
const settle = <T>(p: Promise<T>) => p.then(() => "ok", (e) => errorCode(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1557${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

// SMTP stub: records what would be sent; fail = true makes sendMail throw
const sentMail: Array<{ to: string; subject: string; html: string }> = [];
let smtpFails = false;
(EmailService as any).transporter = {
    sendMail: async (mail: any) => {
        if (smtpFails) throw new Error("SMTP down (test)");
        sentMail.push({ to: mail.to, subject: mail.subject, html: mail.html });
        return { messageId: `test-${sentMail.length}` };
    },
};

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing non-local database "${dbHost}"`);

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Owner", lastName: "Mail" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Mail ${runId}`, slug: `mail-${runId}`, email: `mail-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const plan = await prisma.plan.create({ data: { name: `Mail ${runId}`, slug: `mail-${runId}` } });
    await prisma.planVersion.create({ data: { planUuid: plan.uuid, version: 1, priceMonthly: 0, features: {} } });
    await prisma.planPrice.create({ data: { planUuid: plan.uuid, interval: "MONTHLY", amount: 0 } });
    await SubscriptionService.createSubscription({ tenantUuid: tenant.uuid, planUuid: plan.uuid, interval: "MONTHLY" });

    const store = await prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: "Mail <Store>", slug: `mail-s1-${runId}`, city: "Mogadishu" },
    });
    await prisma.storeOpeningHour.createMany({
        data: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
            tenantUuid: tenant.uuid, storeUuid: store.uuid, dayOfWeek: day as any, periods: [], is24Hours: true,
        })),
    });
    return { tenant, store, owner };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

async function person(ctx: Ctx, name: string, opts: { cashier?: boolean; email?: string } = {}) {
    const user = await prisma.user.create({
        data: { phoneNumber: phone(), firstName: name, lastName: "Mail", name, email: opts.email },
    });
    const member = await prisma.tenantUser.create({
        data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, slug: `mail-${name.toLowerCase().replace(/\W/g, "")}-${runId}-${seq++}` },
    });
    if (opts.cashier) {
        await prisma.userStore.create({
            data: { tenantUuid: ctx.tenant.uuid, userUuid: user.uuid, tenantUserUuid: member.uuid, storeUuid: ctx.store.uuid, role: "CASHIER" },
        });
    }
    return { user, member };
}

async function sale(ctx: Ctx, customerMember: string, by: string, amount: number) {
    const order = await prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid, storeUuid: ctx.store.uuid, tenantUserUuid: customerMember,
            orderNumber: `MAIL-${runId}-${seq++}`, subtotal: amount, totalAmount: amount, menuVersion: 1, pricingSnapshot: {},
        },
    });
    const payment = await CashierPaymentService.processPayment({
        orderUuid: order.uuid, tenantUuid: ctx.tenant.uuid, paymentMethod: "CARD_TERMINAL", amount,
        processedBy: by, deviceId: "mail-test", terminalId: `CARD-${runId}`, idempotencyKey: crypto.randomUUID(),
    });
    return { order, payment };
}

const outboxFor = (tenantUuid: string) =>
    prisma.emailOutbox.findMany({ where: { tenantUuid }, orderBy: { createdAt: "asc" } });

async function ipWhitelist(ctx: Ctx) {
    console.log("\n=== 1. IP whitelist ===");
    const t = ctx.tenant.uuid;
    const add = (rule: { ipAddress?: string; ipRange?: string; allowedFor?: string[]; expiresAt?: Date }) =>
        IPWhitelistService.addIP({ tenantUuid: t, allowedFor: rule.allowedFor ?? ["*"], addedBy: ctx.owner.uuid, ...rule });
    const allowed = (ip: string, operation = "ADMIN_ACCESS") => IPWhitelistService.isIPWhitelisted({ tenantUuid: t, ipAddress: ip, operation });

    check("range without an address is saved", await settle(add({ ipRange: "10.20.0.0/16" })), "ok");
    check("single address is saved", await settle(add({ ipAddress: "203.0.113.7", allowedFor: ["PAYMENT_CONFIG"] })), "ok");
    check("IPv6 range is saved", await settle(add({ ipRange: "2001:db8::/32" })), "ok");
    check("address and range together are refused", await settle(add({ ipAddress: "1.2.3.4", ipRange: "1.2.3.0/24" })), "INVALID_IP_RULE");
    check("neither is refused", await settle(add({})), "INVALID_IP_RULE");
    check("bad address is refused", await settle(add({ ipAddress: "999.1.1.1" })), "INVALID_IP_ADDRESS");
    check("bad range is refused", await settle(add({ ipRange: "10.0.0.0/33" })), "INVALID_IP_RANGE");
    check("range without prefix is refused", await settle(add({ ipRange: "10.0.0.0" })), "INVALID_IP_RANGE");
    const raw = await prisma.$executeRaw`
        INSERT INTO "IPWhitelist" ("uuid", "tenantUuid", "allowedFor", "addedBy", "updatedAt")
        VALUES (${crypto.randomUUID()}, ${t}, '["*"]'::jsonb, ${ctx.owner.uuid}, now())
    `.then(() => "inserted", (e: any) => (String(e.message).includes("IPWhitelist_address_or_range_check") ? "CHECK_VIOLATION" : e.message));
    check("database refuses a rule with neither", raw, "CHECK_VIOLATION");

    check("address inside the range", await allowed("10.20.5.9"), true);
    check("...again, from the cached rules", await allowed("10.20.5.9"), true);
    check("address outside the range", await allowed("10.21.0.1"), false);
    check("IPv4-mapped IPv6 client inside the range", await allowed("::ffff:10.20.1.1"), true);
    check("IPv6 client inside the IPv6 range", await allowed("2001:db8:1::5"), true);
    check("exact address, allowed operation", await allowed("203.0.113.7", "PAYMENT_CONFIG"), true);
    check("exact address, other operation", await allowed("203.0.113.7", "ADMIN_ACCESS"), false);
    check("garbage client address", await allowed("not-an-ip"), false);

    // Cached as denied, then a rule is added: applies on the next check
    check("198.51.100.4 before its rule", await allowed("198.51.100.4"), false);
    const late = await add({ ipRange: "198.51.100.0/24" });
    check("...after adding a range (cache dropped)", await allowed("198.51.100.4"), true);
    check("removing the range", await IPWhitelistService.removeIP({ tenantUuid: t, whitelistUuid: late.uuid, removedBy: ctx.owner.uuid }), true);
    check("...applies at once", await allowed("198.51.100.4"), false);
    check("removing it again", await IPWhitelistService.removeIP({ tenantUuid: t, whitelistUuid: late.uuid, removedBy: ctx.owner.uuid }), false);

    await add({ ipAddress: "192.0.2.10", expiresAt: new Date(Date.now() + 1500) });
    check("rule before it expires", await allowed("192.0.2.10"), true);
    await sleep(1700);
    check("...after it expires (even from cache)", await allowed("192.0.2.10"), false);
}

async function disputes(ctx: Ctx) {
    console.log("\n=== 2. Dispute uniqueness ===");
    const cashier = await person(ctx, "DisputeCashier", { cashier: true });
    const customer = await person(ctx, "DisputeCustomer");
    const { payment } = await sale(ctx, customer.member.uuid, cashier.user.uuid, 1200);
    const providerDisputeId = `dp_${runId}`;
    const deliver = () => PaymentDisputeService.createFromWebhook({
        provider: "stripe", providerDisputeId, paymentUuid: payment.uuid, amount: 1200,
        reason: "fraudulent", snapshot: { id: providerDisputeId },
    });

    const results = await Promise.allSettled([deliver(), deliver(), deliver()]);
    check("3 concurrent deliveries all succeed", results.filter((r) => r.status === "fulfilled").length, 3);
    const uuids = new Set(results.map((r) => (r.status === "fulfilled" ? r.value.uuid : "")));
    check("...and return the same dispute", uuids.size, 1);
    check("one dispute row", await prisma.paymentDispute.count({ where: { providerDisputeUuid: providerDisputeId } }), 1);
    const alerts = await prisma.adminAlert.count({
        where: { tenantUuid: ctx.tenant.uuid, title: "Payment Dispute Filed" },
    });
    check("one dispute alert", alerts, 1);
    check("a later redelivery returns it too", (await deliver()).uuid, [...uuids][0]);
    const sameIdOtherProvider = await PaymentDisputeService.createFromWebhook({
        provider: "evc_plus", providerDisputeId, paymentUuid: payment.uuid, amount: 1200, reason: "general", snapshot: {},
    });
    check("same id from another provider is a separate dispute", sameIdOtherProvider.uuid !== [...uuids][0], true);
}

async function receipts(ctx: Ctx) {
    console.log("\n=== 3. Receipt emails ===");
    registerReceiptHandlers();
    const cashier = await person(ctx, "ReceiptCashier", { cashier: true, email: `cashier-${runId}@example.test` });
    const customer = await person(ctx, `Ana <b>Bold</b>`, { email: `ana-${runId}@example.test` });

    const { payment } = await sale(ctx, customer.member.uuid, cashier.user.uuid, 450);
    // processPayment emits CASHIER_PAYMENT_COMPLETED without awaiting the handlers
    let rows = await outboxFor(ctx.tenant.uuid);
    for (let i = 0; i < 40 && rows.length === 0; i++) { await sleep(100); rows = await outboxFor(ctx.tenant.uuid); }
    check("payment queues one receipt email", rows.length, 1);
    check("...to the customer", rows[0]?.to.join(","), `ana-${runId}@example.test`);
    check("...with the receipt template", rows[0]?.templateKey, "receipt");

    const again = await Promise.all([1, 2, 3].map(() => ReceiptService.issueOnPayment(payment.uuid)));
    check("repeated payment events don't queue more", again.every((o) => o === "ALREADY_SENT"), true);

    const first = await ReceiptService.generate(payment.uuid);
    const second = await ReceiptService.generate(payment.uuid);
    check("viewing twice gives the same receipt number", first?.receiptNumber === second?.receiptNumber && !!first?.receiptNumber, true);
    check("...and queues no email", (await outboxFor(ctx.tenant.uuid)).length, 1);

    // A cashier ringing up a walk-in under their own account
    const walkIn = await sale(ctx, cashier.member.uuid, cashier.user.uuid, 300);
    check("staff-entered walk-in order: no automatic email", await ReceiptService.issueOnPayment(walkIn.payment.uuid), "NO_RECIPIENT");

    await ReceiptService.resend(payment.uuid, `other-${runId}@example.test`);
    rows = await outboxFor(ctx.tenant.uuid);
    check("resend queues exactly one more", rows.length, 2);
    check("...to the address asked for", rows[1]?.to.join(","), `other-${runId}@example.test`);
    check("walk-in resend without an address is refused (not sent to the cashier)", await settle(ReceiptService.resend(walkIn.payment.uuid)), "NO_EMAIL_ADDRESS");
    check("...nothing queued", (await outboxFor(ctx.tenant.uuid)).length, 2);
    return { payment };
}

async function outbox(ctx: Ctx) {
    console.log("\n=== 4. Outbox processor ===");
    const mine = () => outboxFor(ctx.tenant.uuid);

    await EmailOutboxProcessorJob.run();
    let rows = await mine();
    check("queued receipts sent", rows.filter((r) => r.status === "SENT").length, rows.length);
    const html = sentMail.find((m) => m.to === `ana-${runId}@example.test`)?.html ?? "";
    check("customer name is escaped in the email", html.includes("Ana &lt;b&gt;Bold&lt;/b&gt;") && !html.includes("<b>Bold"), true);
    check("store name is escaped", html.includes("Mail &lt;Store&gt;"), true);
    check("amount shown in currency units", html.includes("4.50"), true);
    const before = sentMail.length;
    await EmailOutboxProcessorJob.run();
    check("a second run sends nothing again", sentMail.length, before);

    // SMTP down: retried with a delay, then failed after maxAttempts
    smtpFails = true;
    const flaky = await prisma.emailOutbox.create({
        data: { tenantUuid: ctx.tenant.uuid, to: [`flaky-${runId}@example.test`], subject: "Flaky", templateKey: "receipt", templateData: {}, maxAttempts: 2 },
    });
    await EmailOutboxProcessorJob.run();
    let row = await prisma.emailOutbox.findUniqueOrThrow({ where: { uuid: flaky.uuid } });
    check("failed send goes back to PENDING", `${row.status} ${row.attempts}`, "PENDING 1");
    check("...with a retry time in the future", !!row.nextRetryAt && row.nextRetryAt > new Date(), true);
    await EmailOutboxProcessorJob.run();
    check("...and isn't retried before then", (await prisma.emailOutbox.findUniqueOrThrow({ where: { uuid: flaky.uuid } })).attempts, 1);
    await prisma.emailOutbox.update({ where: { uuid: flaky.uuid }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
    await EmailOutboxProcessorJob.run();
    row = await prisma.emailOutbox.findUniqueOrThrow({ where: { uuid: flaky.uuid } });
    check("FAILED after maxAttempts", `${row.status} ${row.attempts}`, "FAILED 2");
    check("...error kept", row.lastError, "SMTP down (test)");
    smtpFails = false;

    const stale = await prisma.emailOutbox.create({
        data: { tenantUuid: ctx.tenant.uuid, to: [`late-${runId}@example.test`], subject: "Late", templateKey: "receipt", expiresAt: new Date(Date.now() - 1000) },
    });
    const later = await prisma.emailOutbox.create({
        data: { tenantUuid: ctx.tenant.uuid, to: [`later-${runId}@example.test`], subject: "Later", templateKey: "receipt", sendAfter: new Date(Date.now() + 3_600_000) },
    });
    const noTemplate = await prisma.emailOutbox.create({
        data: { tenantUuid: ctx.tenant.uuid, to: [`raw-${runId}@example.test`], subject: "Raw" },
    });
    const stuck = await prisma.emailOutbox.create({
        data: { tenantUuid: ctx.tenant.uuid, to: [`stuck-${runId}@example.test`], subject: "Stuck", templateKey: "receipt", templateData: {}, status: "PROCESSING", attempts: 1, lastAttemptAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    await EmailOutboxProcessorJob.run();
    const status = async (uuid: string) => (await prisma.emailOutbox.findUniqueOrThrow({ where: { uuid } })).status;
    check("expired row not sent", await status(stale.uuid), "EXPIRED");
    check("row with sendAfter in the future waits", await status(later.uuid), "PENDING");
    check("row without a template fails", await status(noTemplate.uuid), "FAILED");
    check("row stuck in PROCESSING is recovered and sent", await status(stuck.uuid), "SENT");
}

async function main() {
    const ctx = await setup();
    console.log(`Run ${runId}`);
    await ipWhitelist(ctx);
    await disputes(ctx);
    await receipts(ctx);
    await outbox(ctx);
}

let exitCode = 0;
try {
    await main();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nTest crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
