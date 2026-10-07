// LOCAL CASHIER & REFUND SAFETY CHECKS
// Calls the cashier payment and refund services directly against the local
// database and checks the results there:
//
//   1. Cashier idempotent replay - resending a processed payment's
//      Idempotency-Key returns the stored payment instead of throwing.
//   2. Concurrent voids - N simultaneous voids of one payment: exactly one
//      succeeds, the cash drawer is reversed once, PAYMENT_VOIDED fires once.
//   3. Refund approvals - a refund for a customer under manual review is
//      parked as PENDING_APPROVAL, which processRefund (what the refund job
//      runs) leaves alone; the requester can't approve it; of concurrent
//      approvals only one applies; rejection is final.
//      Needs the 20261007120000_add_refund_pending_approval migration; skipped
//      with a notice if it isn't applied.
//
//   npx tsx scripts/test-payments-refunds.ts
//
// Uses CASH payments, so no step can reach Stripe; the one approved refund is
// marked FAILED at the end so a running server's RefundProcessorJob never
// tries to process it. Reuses the seed-test-payment tenant; each run creates
// its own store. Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

// Quiet the app's logging; must be set before the app modules load, hence the
// dynamic imports.
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { EventBus } = await import("../src/events/eventBus.ts");
const { CashierPaymentService } = await import("../src/services/payment/cashier/payment.cashier.service.ts");
const { RefundService } = await import("../src/services/payment/Refund.service.ts");
const { PaymentRestrictionService } = await import("../src/services/payment/PaymentRestriction.service.ts");

const TEST_TENANT_SLUG = "sim-test-tenant";
const MANAGER_PIN = "4321";
const TERMINAL = "POS-TEST-1";
const VOIDS = 5;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];

async function member(phoneNumber: string, firstName: string, tenantUuid: string, slug: string) {
    const user = await prisma.user.upsert({
        where: { phoneNumber },
        update: {},
        create: { phoneNumber, firstName, lastName: "Test" },
    });
    const tenantUser =
        (await prisma.tenantUser.findFirst({ where: { tenantUuid, userUuid: user.uuid } })) ??
        (await prisma.tenantUser.create({ data: { tenantUuid, userUuid: user.uuid, slug } }));
    return { user, tenantUser };
}

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    const owner = await prisma.user.upsert({
        where: { phoneNumber: "+10000000001" },
        update: {},
        create: { phoneNumber: "+10000000001", firstName: "Sim", lastName: "Customer" },
    });
    const tenant = await prisma.tenant.upsert({
        where: { slug: TEST_TENANT_SLUG },
        update: {},
        create: {
            name: "Simulation Coffee Co",
            slug: TEST_TENANT_SLUG,
            email: "sim-tenant@example.test",
            ownerUuid: owner.uuid,
        },
    });

    const cust = await member("+10000000001", "Sim", tenant.uuid, "sim-customer");
    const mgr = await member("+10000000003", "Manager", tenant.uuid, "sim-manager");
    const mgr2 = await member("+10000000004", "Approver", tenant.uuid, "sim-approver");
    await prisma.user.update({
        where: { uuid: mgr.user.uuid },
        data: { pinHash: await bcrypt.hash(MANAGER_PIN, 10) },
    });

    const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
    const store = await prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: `Cashier Store ${runId}`, slug: `cashier-${runId}`, city: "Mogadishu" },
    });
    // voidPayment requires the manager to hold a void-capable role at the store
    await prisma.userStore.create({
        data: {
            userUuid: mgr.user.uuid,
            storeUuid: store.uuid,
            tenantUserUuid: mgr.tenantUser.uuid,
            tenantUuid: tenant.uuid,
            role: "MANAGER",
        },
    });
    const drawer = await prisma.cashDrawer.create({
        data: {
            tenantUuid: tenant.uuid,
            storeUuid: store.uuid,
            terminalId: TERMINAL,
            status: "OPEN",
            openedBy: mgr.user.uuid,
            openedAt: new Date(),
        },
    });

    return { tenant, cust, mgr, mgr2, store, drawer, runId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

let orderSeq = 0;
function pendingOrder(ctx: Ctx, total: number) {
    return prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            tenantUserUuid: ctx.cust.tenantUser.uuid,
            orderNumber: `CASH-${ctx.runId}-${orderSeq++}`,
            status: "PENDING",
            paymentStatus: "PENDING",
            currency: "USD",
            subtotal: total,
            totalAmount: total,
            menuVersion: 1,
            pricingSnapshot: { items: [], calculations: { subtotal: total, total } },
        },
    });
}

function payCash(ctx: Ctx, orderUuid: string, total: number, idempotencyKey: string) {
    return CashierPaymentService.processPayment({
        tenantUuid: ctx.tenant.uuid,
        orderUuid,
        paymentMethod: "CASH",
        amount: total,
        amountTendered: total * 2,
        changeGiven: total,
        processedBy: ctx.mgr.user.uuid,
        deviceId: "test-device",
        terminalId: TERMINAL,
        idempotencyKey,
    });
}

async function cashierPayments(ctx: Ctx) {
    console.log("\n=== 1. Cashier idempotent replay ===");
    const total = 500;
    const order = await pendingOrder(ctx, total);
    const key = `cashier-${crypto.randomUUID()}`;

    const payment = await payCash(ctx, order.uuid, total, key);
    const replay = await payCash(ctx, order.uuid, total, key).then(
        (p: any) => `payment ${p.uuid}`,
        (e) => `THREW ${e.message}`
    );
    check("retry with the same key returns the stored payment", replay, `payment ${payment.uuid}`);
    const afterPay = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: ctx.drawer.uuid } });

    console.log(`\n=== 2. ${VOIDS} concurrent voids of one payment ===`);
    let voidedEvents = 0;
    EventBus.on("PAYMENT_VOIDED", (p) => {
        if (p.paymentUuid === payment.uuid) voidedEvents++;
    });

    const results = await Promise.all(
        Array.from({ length: VOIDS }, () =>
            CashierPaymentService.voidPayment({
                tenantUuid: ctx.tenant.uuid,
                paymentUuid: payment.uuid,
                voidedBy: ctx.mgr.user.uuid,
                voidReason: "Customer changed their mind at the counter",
                managerPin: MANAGER_PIN,
                managerUuid: ctx.mgr.user.uuid,
            }).then(() => "voided", (e) => errorCode(e))
        )
    );
    // emit() is fire-and-forget; let its listeners run
    await new Promise((resolve) => setTimeout(resolve, 200));

    const counts = results.reduce<Record<string, number>>((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {});
    console.log(`  outcomes: ${Object.entries(counts).map(([k, n]) => `${k} x${n}`).join(", ")}`);

    const afterVoid = await prisma.cashDrawer.findUniqueOrThrow({ where: { uuid: ctx.drawer.uuid } });
    const voided = await prisma.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } });
    const snapshots = await prisma.paymentAuditSnapshot.count({
        where: { paymentUuid: payment.uuid, reason: "PAYMENT_VOIDED" },
    });

    check("voids that succeeded", counts.voided ?? 0, 1);
    check("voids rejected with CANNOT_VOID_STATUS", counts.CANNOT_VOID_STATUS ?? 0, VOIDS - 1);
    check("payment status", voided.status, "VOIDED");
    check("PAYMENT_VOIDED events (stock restores)", voidedEvents, 1);
    check("void audit snapshots", snapshots, 1);
    check("drawer expectedCash reversed exactly once", afterPay.expectedCash - afterVoid.expectedCash, total);
    check("drawer totalSales reversed exactly once", afterPay.totalSales - afterVoid.totalSales, total);
}

async function refundApprovals(ctx: Ctx) {
    console.log("\n=== 3. Refund approvals ===");
    const [{ present }] = await prisma.$queryRaw<Array<{ present: boolean }>>`
        SELECT EXISTS (
            SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'RefundStatus' AND e.enumlabel = 'PENDING_APPROVAL'
        ) AS present
    `;
    if (!present) {
        console.log("  SKIPPED: RefundStatus.PENDING_APPROVAL is not in the database.");
        console.log("           Apply the migration (npx prisma migrate deploy) and re-run.");
        failures++;
        return;
    }

    // Put the customer under manual review, then refund two paid orders
    await PaymentRestrictionService.requireManualReview({
        tenantUuid: ctx.tenant.uuid,
        tenantUserUuid: ctx.cust.tenantUser.uuid,
        reason: "test: manual review",
    });

    const paidOrder = async () => {
        const order = await pendingOrder(ctx, 700);
        await payCash(ctx, order.uuid, 700, `cashier-${crypto.randomUUID()}`);
        return order;
    };
    const request = async () =>
        RefundService.requestRefund({
            orderUuid: (await paidOrder()).uuid,
            reason: "Drink was wrong",
            requestedBy: ctx.mgr.user.uuid,
        });

    const refund = await request();
    check("high-risk refund is parked", refund.status, "PENDING_APPROVAL");

    // What RefundProcessorJob runs for each refund it picks up
    await RefundService.processRefund(refund.uuid);
    const untouched = await prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    check("processRefund leaves a parked refund alone", untouched.status, "PENDING_APPROVAL");

    const self = await RefundService.approveRefund({
        tenantUuid: ctx.tenant.uuid,
        refundUuid: refund.uuid,
        approvedBy: ctx.mgr.user.uuid,
    }).then(() => "approved", (e) => errorCode(e));
    check("requester cannot approve their own refund", self, "REFUND_SELF_APPROVAL_NOT_ALLOWED");

    const decisions = await Promise.all([
        RefundService.approveRefund({ tenantUuid: ctx.tenant.uuid, refundUuid: refund.uuid, approvedBy: ctx.mgr2.user.uuid }),
        RefundService.approveRefund({ tenantUuid: ctx.tenant.uuid, refundUuid: refund.uuid, approvedBy: ctx.mgr2.user.uuid }),
        RefundService.rejectRefund({ tenantUuid: ctx.tenant.uuid, refundUuid: refund.uuid, rejectedBy: ctx.mgr2.user.uuid, reason: "race" }),
    ].map((p) => p.then((r) => `ok:${r.status}`, (e) => errorCode(e))));
    console.log(`  concurrent decisions: ${decisions.join(", ")}`);
    const decided = await prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    check("exactly one concurrent decision applied", decisions.filter((d) => d.startsWith("ok:")).length, 1);
    check("final status matches the winning decision", `ok:${decided.status}`, decisions.find((d) => d.startsWith("ok:")));

    const rejected = await request();
    await RefundService.rejectRefund({
        tenantUuid: ctx.tenant.uuid,
        refundUuid: rejected.uuid,
        rejectedBy: ctx.mgr2.user.uuid,
        reason: "Not eligible",
    });
    const reopened = await RefundService.approveRefund({
        tenantUuid: ctx.tenant.uuid,
        refundUuid: rejected.uuid,
        approvedBy: ctx.mgr2.user.uuid,
    }).then(() => "approved", (e) => errorCode(e));
    const rejectedRow = await prisma.refund.findUniqueOrThrow({ where: { uuid: rejected.uuid } });
    check("rejected refund status", rejectedRow.status, "REJECTED");
    check("rejection reason recorded", (rejectedRow.metadata as any)?.rejection?.reason, "Not eligible");
    check("a rejected refund cannot be approved later", reopened, "REFUND_NOT_PENDING_APPROVAL");

    // Keep a running server's RefundProcessorJob away from the test refund
    await prisma.refund.updateMany({
        where: { uuid: refund.uuid, status: "REQUESTED" },
        data: { status: "FAILED", failureReason: "test-payments-refunds cleanup" },
    });
}

async function main() {
    const ctx = await setup();
    console.log("Cashier & refund safety checks");
    console.log(`  tenant: ${ctx.tenant.uuid} (${ctx.tenant.slug})`);
    console.log(`  store:  ${ctx.store.uuid} (${ctx.store.slug})`);

    await cashierPayments(ctx);
    await refundApprovals(ctx);

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-payments-refunds failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
