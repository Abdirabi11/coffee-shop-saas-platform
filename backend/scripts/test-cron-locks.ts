// LOCAL CRON LOCK, REFUND CLAIM & INVOICE UNIQUENESS CHECKS
//
//   1. withJobLock - overlapping runs on one instance are skipped; across
//      instances only one runs; the lease is released after success and
//      failure; an expired lease (crashed instance) is taken over, a live one
//      is not. A second instance is simulated by importing a separate copy of
//      jobs/jobLock.ts (its own in-process state) against the same database.
//   2. RefundService.processRefund - concurrent processors claim a REQUESTED
//      refund once, so the provider is called once, with a stable
//      idempotency key. The provider adapter is stubbed: nothing reaches
//      Stripe.
//   3. Invoice - the database rejects a second invoice for the same tenant,
//      subscription, type and billing period.
//
//   npx tsx scripts/test-cron-locks.ts
//
// Needs the 20261007140000_job_locks_and_unique_invoice_period migration.
// Creates its own tenant, store and orders. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const instance1 = await import("../src/jobs/jobLock.ts");
const instance2 = await import("../src/jobs/jobLock.ts?instance=2");
const { RefundService } = await import("../src/services/payment/Refund.service.ts");
const { PaymentProviderAdapter } = await import("../src/infrastructure/payments/providers/paymentProvider.adapter.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const outcome = (r: { ran: boolean; reason?: string }) => (r.ran ? "ran" : r.reason);

async function jobLocks() {
    console.log("\n=== 1. withJobLock ===");

    const job = `TestJob-${runId}`;
    let executions = 0;
    const slow = async () => {
        executions++;
        await sleep(500);
        return "done";
    };

    const sameInstance = await Promise.all([instance1.withJobLock(job, slow), instance1.withJobLock(job, slow)]);
    check("same instance, overlapping ticks", sameInstance.map(outcome).sort().join(","), "RUNNING_HERE,ran");

    const crossJob = `${job}-cross`;
    const cross = await Promise.all([
        instance1.withJobLock(crossJob, slow),
        instance2.withJobLock(crossJob, slow),
        instance2.withJobLock(crossJob, slow),
    ]);
    const counts = cross.map(outcome).reduce<Record<string, number>>((a, k) => ((a[k!] = (a[k!] ?? 0) + 1), a), {});
    console.log(`  cross-instance outcomes: ${JSON.stringify(counts)}`);
    check("two instances, same tick: runs", counts.ran ?? 0, 1);
    check("total executions so far", executions, 2);

    const next = await instance2.withJobLock(crossJob, slow);
    check("next tick after release, other instance", outcome(next), "ran");

    const failing = await instance1.withJobLock(`${job}-fail`, async () => {
        throw new Error("boom");
    }).then(() => "no error", (e) => e.message);
    check("job error propagates", failing, "boom");
    check("lease released after a failed run", outcome(await instance2.withJobLock(`${job}-fail`, slow)), "ran");

    // A crashed instance leaves its lease behind
    const crashed = `${job}-crashed`;
    await prisma.jobLock.create({
        data: { jobName: crashed, lockToken: "dead", lockedBy: "dead-host:1", lockedUntil: new Date(Date.now() + 60_000), acquiredAt: new Date() },
    });
    check("live lease held by another instance", outcome(await instance1.withJobLock(crashed, slow)), "LOCKED_ELSEWHERE");
    await prisma.$executeRaw`UPDATE "JobLock" SET "lockedUntil" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobName" = ${crashed}`;
    check("expired lease is taken over", outcome(await instance1.withJobLock(crashed, slow)), "ran");
    const row = await prisma.jobLock.findUniqueOrThrow({ where: { jobName: crashed } });
    check("released lease is expired (next tick can take it)", row.lockedUntil.getTime() <= Date.now(), true);
}

async function refundClaims() {
    console.log("\n=== 2. Concurrent refund processing ===");
    const owner = await prisma.user.create({
        data: { phoneNumber: `+1888${String(Date.now()).slice(-7)}`, firstName: "Cron", lastName: "Test" },
    });
    const tenant = await prisma.tenant.create({
        data: { name: `Cron ${runId}`, slug: `cron-${runId}`, email: "cron@test.test", ownerUuid: owner.uuid },
    });
    const tenantUser = await prisma.tenantUser.create({ data: { tenantUuid: tenant.uuid, userUuid: owner.uuid, slug: `cron-${runId}` } });
    const store = await prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: `Cron ${runId}`, slug: `cron-${runId}`, city: "Mogadishu" },
    });
    const order = await prisma.order.create({
        data: {
            tenantUuid: tenant.uuid, storeUuid: store.uuid, tenantUserUuid: tenantUser.uuid,
            orderNumber: `CRON-${runId}`, status: "PAID", paymentStatus: "PAID", currency: "USD",
            subtotal: 900, totalAmount: 900, menuVersion: 1, pricingSnapshot: {},
        },
    });
    const payment = await prisma.payment.create({
        data: {
            orderUuid: order.uuid, tenantUuid: tenant.uuid, storeUuid: store.uuid,
            amount: 900, currency: "USD", subtotal: 900, tax: 0,
            paymentFlow: "PROVIDER", paymentMethod: "STRIPE", provider: "STRIPE",
            providerRef: "pi_test_never_sent", status: "PAID",
            snapshot: {}, orderSnapshot: {}, pricingRules: {},
        },
    });
    const refund = await prisma.refund.create({
        data: {
            tenantUuid: tenant.uuid, paymentUuid: payment.uuid, orderUuid: order.uuid, storeUuid: store.uuid,
            amount: 900, currency: "USD", type: "FULL", status: "REQUESTED",
            reason: "test", requestedBy: owner.uuid, provider: "STRIPE", snapshot: {},
        },
    });

    // Stub the provider: count calls, never reach Stripe
    const calls: Array<{ idempotencyKey: string }> = [];
    (PaymentProviderAdapter as any).refund = async (input: any) => {
        calls.push(input);
        await sleep(200); // a slow provider widens the race
        return { providerRef: `re_test_${calls.length}`, snapshot: {} };
    };

    const results = await Promise.all(
        Array.from({ length: 5 }, () => RefundService.processRefund(refund.uuid).then((r: any) => r.status, (e) => `THREW ${e.message}`))
    );
    console.log(`  processor results: ${results.join(", ")}`);
    const final = await prisma.refund.findUniqueOrThrow({ where: { uuid: refund.uuid } });
    const finalPayment = await prisma.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } });

    check("provider refund calls", calls.length, 1);
    check("idempotency key", calls[0]?.idempotencyKey, `refund-${refund.uuid}`);
    check("refund status", final.status, "COMPLETED");
    check("payment status", finalPayment.status, "REFUNDED");

    return { tenant, subscriptionTenantUuid: tenant.uuid };
}

async function invoiceUniqueness() {
    console.log("\n=== 3. Invoice period uniqueness ===");
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'Invoice' AND indexname = 'Invoice_tenantUuid_subscriptionUuid_type_periodStart_key'
    `;
    check("unique index on (tenantUuid, subscriptionUuid, type, periodStart)", index?.indexdef.startsWith("CREATE UNIQUE INDEX"), true);

    // Exercise it: the referenced tenant/subscription/snapshot rows aren't
    // needed for the uniqueness check, so defer FK checks and roll back.
    const attempt = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL DEFERRED`);
        await tx.$executeRawUnsafe(`ALTER TABLE "Invoice" DISABLE TRIGGER ALL`);
        const insert = (n: number) => tx.$executeRaw`
            INSERT INTO "Invoice" ("uuid", "tenantUuid", "subscriptionUuid", "billingSnapshotUuid", "invoiceNumber",
                                   "type", "periodStart", "billTo", "billFrom", "total", "amountDue", "updatedAt")
            VALUES (${crypto.randomUUID()}, 'tenant-x', 'sub-x', 'snap-x', ${`INV-TEST-${runId}-${n}`},
                    'SUBSCRIPTION', '2026-10-01T00:00:00Z', '{}', '{}', 100, 100, now())
        `;
        await insert(1);
        const second = await insert(2).then(() => "inserted", (e) =>
            e instanceof Prisma.PrismaClientKnownRequestError ? e.code : String(e.message).includes("23505") ? "23505" : e.message);
        throw Object.assign(new Error("rollback"), { second });
    }).catch((e) => e.second ?? e.message);
    check("second invoice for the same period", ["P2002", "P2010", "23505"].includes(attempt) ? "rejected" : attempt, "rejected");
}

async function main() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }
    console.log("Cron lock, refund claim & invoice checks");
    await jobLocks();
    await refundClaims();
    await invoiceUniqueness();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-cron-locks failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
