// LOCAL BILLING CHECKS: defused enforcement jobs, plan changes
// Calls the billing jobs and SubscriptionService.changePlan directly against
// the local database:
//
//   1. Defused jobs - generateMonthlyInvoices, markOverdueInvoices and
//      suspendOverdueTenants return without touching anything, and the
//      scheduler no longer registers them.
//   2. Plan lookup - a missing, unknown or inactive plan is refused, and so
//      is a plan version that belongs to a different plan (it used to decide
//      which limits were checked).
//   3. Limits - a change is refused while the tenant uses more than the
//      target plan allows (active stores; staff = people assigned to a
//      store, not customers; products), whether the limit comes from a
//      PlanQuota row or the plan version's quotas JSON. A refused change
//      leaves the subscription as it was.
//   4. Applied change - the same subscription row moves to the new plan and
//      price, Tenant.maxStores follows, a history row is written.
//   5. Concurrent changes - serialize: history matches what succeeded and the
//      subscription and maxStores end on the same plan.
//
//   npx tsx scripts/test-billing-plan-change.ts
//
// Each run creates its own owner, tenant, plans and stores.
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// Nothing here needs Redis, but importing the app modules connects to it
const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { generateMonthlyInvoices } = await import("../src/jobs/Billing/generateMonthlyInvoices.job.ts");
const { markOverdueInvoices } = await import("../src/jobs/Billing/markOverdueInvoices.job.ts");
const { suspendOverdueTenants } = await import("../src/jobs/Billing/suspendOverdueTenants.job.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];
const settle = <T>(p: Promise<T>) => p.then(() => "ok", (e) => errorCode(e));

function tally(values: string[]): string {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${k} x${n}`).join(", ");
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const phone = () => `+1999${crypto.randomInt(10_000_000, 99_999_999)}`;

async function plan(name: string, price: number, opts: {
    quotas?: Record<string, number>;        // PlanQuota rows
    versionQuotas?: Record<string, number>; // PlanVersion.quotas JSON
    isActive?: boolean;
} = {}) {
    const p = await prisma.plan.create({
        data: { name: `${name} ${runId}`, slug: `${name.toLowerCase()}-${runId}`, isActive: opts.isActive ?? true },
    });
    const version = await prisma.planVersion.create({
        data: { planUuid: p.uuid, version: 1, priceMonthly: price, features: {}, quotas: opts.versionQuotas ?? {} },
    });
    const planPrice = await prisma.planPrice.create({
        data: { planUuid: p.uuid, interval: "MONTHLY", amount: price },
    });
    for (const [quotaKey, limit] of Object.entries(opts.quotas ?? {})) {
        await prisma.planQuota.create({ data: { planUuid: p.uuid, quotaKey, quotaName: quotaKey, limit } });
    }
    return { plan: p, version, price: planPrice };
}

type PlanFixture = Awaited<ReturnType<typeof plan>>;

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Billing", lastName: "Owner" } });
    const tenant = await prisma.tenant.create({
        data: { name: `Billing Co ${runId}`, slug: `billing-${runId}`, email: `billing-${runId}@example.test`, ownerUuid: owner.uuid, maxStores: 5 },
    });

    const pro = await plan("Pro", 5000, { quotas: { maxStores: 5, maxStaff: 10, maxProducts: 100 } });
    // maxStaff only in the version JSON, to check that fallback is enforced
    const basic = await plan("Basic", 1000, { quotas: { maxStores: 2, maxProducts: 50 }, versionQuotas: { maxStaff: 2 } });
    const retired = await plan("Retired", 500, { isActive: false });

    const now = new Date();
    const subscription = await prisma.subscription.create({
        data: {
            tenantUuid: tenant.uuid,
            planUuid: pro.plan.uuid,
            planVersionUuid: pro.version.uuid,
            planPriceUuid: pro.price.uuid,
            subscriptionNumber: `SUB-${runId}`,
            status: "ACTIVE",
            interval: "MONTHLY",
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
            currentPeriodAmount: 5000,
            price: 5000,
            amount: 5000,
            intervalCount: 1,
            taxExempt: false,
        },
    });

    // 3 active stores and 1 closed one
    const stores = [];
    for (let i = 0; i < 4; i++) {
        stores.push(await prisma.store.create({
            data: { tenantUuid: tenant.uuid, name: `Store ${i} ${runId}`, slug: `billing-${runId}-${i}`, city: "Mogadishu", active: i < 3 },
        }));
    }

    // 2 staff (one works at two stores) and 5 customers
    const staff = [];
    for (let i = 0; i < 2; i++) staff.push(await member(tenant.uuid, `staff-${i}`));
    await assign(tenant.uuid, staff[0], stores[0].uuid);
    await assign(tenant.uuid, staff[0], stores[1].uuid);
    await assign(tenant.uuid, staff[1], stores[0].uuid);
    for (let i = 0; i < 5; i++) await member(tenant.uuid, `customer-${i}`);

    const category = await prisma.category.create({
        data: { tenantUuid: tenant.uuid, storeUuid: stores[0].uuid, name: "Billing", slug: "billing" },
    });
    for (let i = 0; i < 3; i++) {
        await prisma.product.create({
            data: { tenantUuid: tenant.uuid, storeUuid: stores[0].uuid, categoryUuid: category.uuid, name: `P${i}`, basePrice: 100 },
        });
    }

    return { tenant, subscription, stores, pro, basic, retired };
}

async function member(tenantUuid: string, slug: string) {
    const user = await prisma.user.create({ data: { phoneNumber: phone(), firstName: slug, lastName: "Test" } });
    const tenantUser = await prisma.tenantUser.create({ data: { tenantUuid, userUuid: user.uuid, slug: `${slug}-${runId}` } });
    return { user, tenantUser };
}

function assign(tenantUuid: string, who: { user: { uuid: string }; tenantUser: { uuid: string } }, storeUuid: string) {
    return prisma.userStore.create({
        data: { tenantUuid, storeUuid, userUuid: who.user.uuid, tenantUserUuid: who.tenantUser.uuid },
    });
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const change = (ctx: Ctx, newPlanUuid: string, newPlanVersionUuid?: string) =>
    SubscriptionService.changePlan({ tenantUuid: ctx.tenant.uuid, newPlanUuid, newPlanVersionUuid, changedBy: "billing-test" });

const subscriptionOf = (ctx: Ctx) => prisma.subscription.findUniqueOrThrow({ where: { tenantUuid: ctx.tenant.uuid } });
const historyOf = (ctx: Ctx) =>
    prisma.subscriptionHistory.findMany({ where: { subscriptionUuid: ctx.subscription.uuid }, orderBy: { occurredAt: "asc" } });

async function defusedJobs(ctx: Ctx) {
    console.log("\n1. Defused billing jobs");

    check("generateMonthlyInvoices created", (await generateMonthlyInvoices()).created, 0);
    check("markOverdueInvoices marked", await markOverdueInvoices(), 0);
    check("suspendOverdueTenants suspended", await suspendOverdueTenants(), 0);
    check("  tenant still", (await prisma.tenant.findUniqueOrThrow({ where: { uuid: ctx.tenant.uuid } })).status, "ACTIVE");
    check("  subscription still", (await subscriptionOf(ctx)).status, "ACTIVE");

    const scheduler = readFileSync(new URL("../src/jobs/scheduler.ts", import.meta.url), "utf8");
    for (const job of ["generateMonthlyInvoices", "markOverdueInvoices", "suspendOverdueTenants"]) {
        check(`scheduler registers ${job}`, scheduler.includes(`() => ${job}()`), false);
    }
}

async function planLookup(ctx: Ctx) {
    console.log("\n2. Plan lookup");

    check("no plan", await settle(change(ctx, "")), "PLAN_REQUIRED");
    check("unknown plan", await settle(change(ctx, crypto.randomUUID())), "PLAN_NOT_FOUND");
    check("inactive plan", await settle(change(ctx, ctx.retired.plan.uuid)), "PLAN_NOT_FOUND");
    check("Basic with Pro's version", await settle(change(ctx, ctx.basic.plan.uuid, ctx.pro.version.uuid)), "PLAN_VERSION_NOT_FOUND");
    check("current plan again", await settle(change(ctx, ctx.pro.plan.uuid)), "ALREADY_ON_PLAN");
}

async function limits(ctx: Ctx) {
    console.log("\n3. Limits (Basic: 2 stores, 2 staff via version JSON, 50 products)");

    check("3 active stores → Basic", await settle(change(ctx, ctx.basic.plan.uuid)), "PLAN_LIMITS_EXCEEDED");
    const sub = await subscriptionOf(ctx);
    check("  subscription still on Pro", sub.planUuid, ctx.pro.plan.uuid);
    check("  subscription still", sub.status, "ACTIVE");
    check("  no history written", (await historyOf(ctx)).length, 0);

    // Close one store: 2 active stores, 2 staff (5 customers don't count)
    await prisma.store.update({ where: { uuid: ctx.stores[2].uuid }, data: { active: false } });

    console.log("\n4. Applied change");
    await change(ctx, ctx.basic.plan.uuid);
    const downgraded = await subscriptionOf(ctx);
    check("same subscription row", downgraded.uuid, ctx.subscription.uuid);
    check("plan", downgraded.planUuid, ctx.basic.plan.uuid);
    check("plan version", downgraded.planVersionUuid, ctx.basic.version.uuid);
    check("plan price", downgraded.planPriceUuid, ctx.basic.price.uuid);
    check("currentPeriodAmount", downgraded.currentPeriodAmount, 1000);
    check("status", downgraded.status, "ACTIVE");
    check("tenant.maxStores", (await prisma.tenant.findUniqueOrThrow({ where: { uuid: ctx.tenant.uuid } })).maxStores, 2);
    const [history] = await historyOf(ctx);
    check("history event", history?.eventType, "DOWNGRADED");

    await change(ctx, ctx.pro.plan.uuid);
    check("back to Pro: history event", (await historyOf(ctx)).at(-1)?.eventType, "UPGRADED");
    check("back to Pro: tenant.maxStores", (await prisma.tenant.findUniqueOrThrow({ where: { uuid: ctx.tenant.uuid } })).maxStores, 5);

    // A third staff member exceeds Basic's version-JSON staff limit
    const third = await member(ctx.tenant.uuid, "staff-2");
    const assignment = await assign(ctx.tenant.uuid, third, ctx.stores[1].uuid);
    const refused = await change(ctx, ctx.basic.plan.uuid).then(() => "ok", (e) => String(e.message));
    check("3 staff → Basic", refused.split(":")[0], "PLAN_LIMITS_EXCEEDED");
    check("  reason names staff", refused.includes("3 staff"), true);
    await prisma.userStore.update({ where: { uuid: assignment.uuid }, data: { isActive: false } });
}

async function concurrent(ctx: Ctx) {
    console.log("\n5. 8 concurrent plan changes");

    const before = (await historyOf(ctx)).length;
    const targets = Array.from({ length: 8 }, (_, i) => (i % 2 ? ctx.pro : ctx.basic).plan.uuid);
    const results = await Promise.all(targets.map((uuid) => settle(change(ctx, uuid))));
    console.log(`    results: ${tally(results)}`);

    const history = await historyOf(ctx);
    const sub = await subscriptionOf(ctx);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { uuid: ctx.tenant.uuid } });
    const unexpected = results.filter((r) => r !== "ok" && r !== "ALREADY_ON_PLAN");
    check("only ok / ALREADY_ON_PLAN", unexpected.length, 0);
    check("history rows = changes applied", history.length - before, results.filter((r) => r === "ok").length);
    check("subscription is on the last applied plan", sub.planUuid, history.at(-1)?.newPlanUuid);
    check("tenant.maxStores matches it", tenant.maxStores, sub.planUuid === ctx.basic.plan.uuid ? 2 : 5);
    check("subscription rows for the tenant", await prisma.subscription.count({ where: { tenantUuid: ctx.tenant.uuid } }), 1);
}

let exitCode = 0;
try {
    const ctx = await setup();
    console.log(`Run ${runId} (tenant ${ctx.tenant.uuid})`);

    await defusedJobs(ctx);
    await planLookup(ctx);
    await limits(ctx);
    await concurrent(ctx);

    console.log(failures === 0 ? "\nAll billing checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nBilling test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
