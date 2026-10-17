// LOCAL CHECKS: kitchen/order broadcasts, plan limits on creation, subscriptions
// Calls the services directly against the local database:
//
//   1. createSubscription - creates the tenant's one subscription row with a
//      price, interval count, number, quotas, history and the tenant's store
//      limit; refuses a second one (also under concurrency); restarts an
//      ended one in place without a second trial; checks the plan, version
//      and interval.
//   2. Plan limits on creation - products, staff (createStaff,
//      grantStoreAccess, invitations) stop at the plan's limit, also under
//      concurrency; a tenant without an active subscription can't add any;
//      the HTTP mapping is 409 / 403.
//   3. Order broadcasts - a real DashboardSocket with its socket server
//      swapped for a recorder: nothing reaches the store room while an order
//      is unpaid; at PAID the store room gets the full kitchen ticket (items,
//      modifiers, no phone or prices); every status change reaches the store
//      room and the customer's own room; cancellations are broadcast too.
//
//   npx tsx scripts/test-kds-quotas-subscriptions.ts
//
// Each run creates its own owners, tenants, plans and stores.
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// Staff and menu changes invalidate caches in Redis
const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { SubscriptionService } = await import("../src/services/billing/Subscription.service.ts");
const { planLimitErrorResponse } = await import("../src/services/billing/PlanLimit.service.ts");
const { ProductAdminService } = await import("../src/services/products/ProductAdmin.service.ts");
const { StaffManagementService } = await import("../src/services/staff/StaffManagement.service.ts");
const { TenantInvitationService } = await import("../src/services/tenant/TenantInvitation.service.ts");
const { OrderStatusService } = await import("../src/services/order/OrderStatus.service.ts");
const { OrderCancellationService } = await import("../src/services/order/OrderCancellation.service.ts");
const { DashboardSocket, canJoinDashboardRoom } = await import("../src/websockets/DashboardSocket.ts");
const { EventBus } = await import("../src/events/eventBus.ts");

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
const phone = () => `+1888${crypto.randomInt(10_000_000, 99_999_999)}`;
let seq = 0;

async function tenant(label: string) {
    const owner = await prisma.user.create({ data: { phoneNumber: phone(), firstName: label, lastName: "Owner" } });
    const t = await prisma.tenant.create({
        data: { name: `${label} ${runId}`, slug: `${label.toLowerCase()}-${runId}-${seq++}`, email: `${label}-${runId}@example.test`, ownerUuid: owner.uuid },
    });
    const store = await prisma.store.create({
        data: { tenantUuid: t.uuid, name: `${label} Store`, slug: `${label.toLowerCase()}-${runId}-${seq++}`, city: "Mogadishu" },
    });
    const category = await prisma.category.create({
        data: { tenantUuid: t.uuid, storeUuid: store.uuid, name: "Main", slug: `main-${seq++}` },
    });
    return { tenant: t, owner, store, category };
}

async function plan(label: string, limits: Record<string, number>, prices: Array<[any, number]> = [["MONTHLY", 1000]]) {
    const p = await prisma.plan.create({ data: { name: `${label} ${runId}`, slug: `${label.toLowerCase()}-${runId}`, trialDays: 14 } });
    const version = await prisma.planVersion.create({
        data: { planUuid: p.uuid, version: 1, priceMonthly: prices[0][1], features: {}, quotas: {} },
    });
    for (const [interval, amount] of prices) {
        await prisma.planPrice.create({ data: { planUuid: p.uuid, interval, amount } });
    }
    for (const [quotaKey, limit] of Object.entries(limits)) {
        await prisma.planQuota.create({ data: { planUuid: p.uuid, quotaKey, quotaName: quotaKey, limit } });
    }
    return { plan: p, version };
}

async function subscriptions() {
    console.log("\n1. createSubscription");

    const sub = await plan("SubPlan", { maxStores: 4, maxProducts: 10 }, [["MONTHLY", 1500], ["YEARLY", 15000]]);
    const other = await plan("OtherPlan", {});
    const a = await tenant("SubA");

    const before = Date.now();
    const created = await SubscriptionService.createSubscription({ tenantUuid: a.tenant.uuid, planUuid: sub.plan.uuid, interval: "MONTHLY" });
    check("status", created.status, "ACTIVE");
    check("planVersion (latest active by default)", created.planVersionUuid, sub.version.uuid);
    check("planPrice is the MONTHLY one", (await prisma.planPrice.findUnique({ where: { uuid: created.planPriceUuid } }))?.amount, 1500);
    check("intervalCount", created.intervalCount, 1);
    check("amounts", `${created.currentPeriodAmount}/${created.price}/${created.amount}`, "1500/1500/1500");
    check("subscriptionNumber set", /^SUB-\d{8}-[0-9A-F]{8}$/.test(created.subscriptionNumber), true);
    const days = Math.round((created.currentPeriodEnd.getTime() - before) / 86_400_000);
    check("period about a month", days >= 28 && days <= 31, true);
    check("usage quotas initialised", await prisma.usageQuota.count({ where: { tenantUuid: a.tenant.uuid } }), 2);
    check("tenant.maxStores", (await prisma.tenant.findUniqueOrThrow({ where: { uuid: a.tenant.uuid } })).maxStores, 4);
    check("history", (await prisma.subscriptionHistory.findFirst({ where: { subscriptionUuid: created.uuid } }))?.eventType, "CREATED");

    check("second subscription", await settle(SubscriptionService.createSubscription({ tenantUuid: a.tenant.uuid, planUuid: sub.plan.uuid, interval: "MONTHLY" })), "SUBSCRIPTION_EXISTS");

    // Ended, then subscribing again (asking for a trial): same row, no second trial
    await prisma.subscription.update({ where: { uuid: created.uuid }, data: { status: "CANCELLED" } });
    const restarted = await SubscriptionService.createSubscription({
        tenantUuid: a.tenant.uuid, planUuid: sub.plan.uuid, interval: "YEARLY", startTrial: true,
    });
    check("restart reuses the row", restarted.uuid, created.uuid);
    check("restart: no second trial", restarted.status, "ACTIVE");
    const years = (restarted.currentPeriodEnd.getTime() - Date.now()) / (365 * 86_400_000);
    check("restart: YEARLY period about a year", years > 0.95 && years < 1.05, true);
    check("restart history", (await prisma.subscriptionHistory.findFirst({ where: { subscriptionUuid: created.uuid }, orderBy: { occurredAt: "desc" } }))?.eventType, "ACTIVATED");

    const b = await tenant("SubB");
    const trial = await SubscriptionService.createSubscription({ tenantUuid: b.tenant.uuid, planUuid: sub.plan.uuid, interval: "MONTHLY", startTrial: true });
    check("first subscription with a trial", trial.status, "TRIALING");

    const c = await tenant("SubC");
    check("interval the plan doesn't offer", await settle(SubscriptionService.createSubscription({ tenantUuid: c.tenant.uuid, planUuid: sub.plan.uuid, interval: "WEEKLY" })), "PLAN_PRICE_NOT_FOUND");
    check("another plan's version", await settle(SubscriptionService.createSubscription({ tenantUuid: c.tenant.uuid, planUuid: sub.plan.uuid, planVersionUuid: other.version.uuid, interval: "MONTHLY" })), "PLAN_VERSION_NOT_FOUND");
    check("unknown plan", await settle(SubscriptionService.createSubscription({ tenantUuid: c.tenant.uuid, planUuid: crypto.randomUUID(), interval: "MONTHLY" })), "PLAN_NOT_FOUND");
    check("  nothing created for the refused tenant", await prisma.subscription.count({ where: { tenantUuid: c.tenant.uuid } }), 0);

    const results = await Promise.all(Array.from({ length: 5 }, () =>
        settle(SubscriptionService.createSubscription({ tenantUuid: c.tenant.uuid, planUuid: sub.plan.uuid, interval: "MONTHLY" }))));
    console.log(`    5 concurrent first creates: ${tally(results)}`);
    check("  created once", results.filter((r) => r === "ok").length, 1);
    check("  others told it exists", results.filter((r) => r === "SUBSCRIPTION_EXISTS").length, 4);
}

async function limits() {
    console.log("\n2. Plan limits on creation (2 products, 1 staff)");

    const limited = await plan("Limited", { maxProducts: 2, maxStaff: 1 });
    const t = await tenant("Limits");
    await SubscriptionService.createSubscription({ tenantUuid: t.tenant.uuid, planUuid: limited.plan.uuid, interval: "MONTHLY" });

    const product = (tenantUuid: string, storeUuid: string, categoryUuid: string) => ProductAdminService.createProduct({
        tenantUuid, storeUuid, categoryUuid, name: `P ${crypto.randomBytes(3).toString("hex")}`, basePrice: 100, triggeredBy: "test",
    });
    check("product 1", await settle(product(t.tenant.uuid, t.store.uuid, t.category.uuid)), "ok");
    check("product 2", await settle(product(t.tenant.uuid, t.store.uuid, t.category.uuid)), "ok");
    check("product 3", await settle(product(t.tenant.uuid, t.store.uuid, t.category.uuid)), "PLAN_LIMIT_REACHED");
    check("  products in DB", await prisma.product.count({ where: { tenantUuid: t.tenant.uuid } }), 2);

    // Concurrency: room for 3, 8 at once
    const three = await plan("Three", { maxProducts: 3 });
    const r = await tenant("Race");
    await SubscriptionService.createSubscription({ tenantUuid: r.tenant.uuid, planUuid: three.plan.uuid, interval: "MONTHLY" });
    const results = await Promise.all(Array.from({ length: 8 }, () => settle(product(r.tenant.uuid, r.store.uuid, r.category.uuid))));
    console.log(`    8 concurrent creates, limit 3: ${tally(results)}`);
    check("  products in DB", await prisma.product.count({ where: { tenantUuid: r.tenant.uuid } }), 3);

    const none = await tenant("NoSub");
    check("tenant without a subscription", await settle(product(none.tenant.uuid, none.store.uuid, none.category.uuid)), "NO_ACTIVE_SUBSCRIPTION");

    const staff = (n: number) => StaffManagementService.createStaff({
        tenantUuid: t.tenant.uuid,
        storeUuids: [t.store.uuid],
        phoneNumber: phone(),
        firstName: `Staff${n}`,
        lastName: "Test",
        pin: "1234",
        role: "STAFF",
        storeRoles: {},
        createdBy: "test",
    });
    const usersBefore = await prisma.user.count();
    check("staff 1", await settle(staff(1)), "ok");
    check("staff 2", await settle(staff(2)), "PLAN_LIMIT_REACHED");
    check("  refused staff left no user behind", await prisma.user.count(), usersBefore + 1);

    const secondStore = await prisma.store.create({
        data: { tenantUuid: t.tenant.uuid, name: "Second", slug: `limits-second-${runId}`, city: "Mogadishu" },
    });
    const staffer = await prisma.userStore.findFirstOrThrow({ where: { tenantUuid: t.tenant.uuid } });
    check("existing staff to a second store", await settle(StaffManagementService.grantStoreAccess({
        userUuid: staffer.userUuid, storeUuid: secondStore.uuid, tenantUuid: t.tenant.uuid, role: "CASHIER",
    })), "ok");
    const outsider = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Outsider", lastName: "Test" } });
    check("new person through store access", await settle(StaffManagementService.grantStoreAccess({
        userUuid: outsider.uuid, storeUuid: t.store.uuid, tenantUuid: t.tenant.uuid, role: "CASHIER",
    })), "PLAN_LIMIT_REACHED");
    check("invitation with store access", await settle(TenantInvitationService.inviteUser({
        tenantUuid: t.tenant.uuid, email: `invitee-${runId}@example.test`, role: "CASHIER", storeUuids: [t.store.uuid], invitedBy: "test",
    })), "PLAN_LIMIT_REACHED");

    // HTTP mapping
    const response = (error: Error) => {
        let status = 0;
        const res: any = { status: (s: number) => { status = s; return { json: () => res }; } };
        planLimitErrorResponse(res, error);
        return status;
    };
    check("PLAN_LIMIT_REACHED → HTTP", response(new Error("PLAN_LIMIT_REACHED: 2 products, plan allows 2")), 409);
    check("NO_ACTIVE_SUBSCRIPTION → HTTP", response(new Error("NO_ACTIVE_SUBSCRIPTION")), 403);
}

async function broadcasts() {
    console.log("\n3. Order broadcasts");

    const sent: Array<{ room: string; event: string; payload: any }> = [];
    const socket = new DashboardSocket(http.createServer());
    (socket as any).io = { to: (room: string) => ({ emit: (event: string, payload: any) => { sent.push({ room, event, payload }); } }) };

    const t = await tenant("Kds");
    const customer = await prisma.user.create({ data: { phoneNumber: phone(), firstName: "Kds", lastName: "Customer" } });
    const tenantUser = await prisma.tenantUser.create({ data: { tenantUuid: t.tenant.uuid, userUuid: customer.uuid, slug: `kds-customer-${runId}` } });
    const product = await prisma.product.create({ data: { tenantUuid: t.tenant.uuid, storeUuid: t.store.uuid, categoryUuid: t.category.uuid, name: "Latte", basePrice: 350 } });

    const newOrder = () => prisma.order.create({
        data: {
            tenantUuid: t.tenant.uuid,
            storeUuid: t.store.uuid,
            tenantUserUuid: tenantUser.uuid,
            orderNumber: `KDS-${runId}-${seq++}`,
            orderType: "TAKEAWAY",
            customerName: "Kds Customer",
            customerPhone: "+15550001111",
            customerNotes: "extra hot",
            subtotal: 425,
            totalAmount: 425,
            menuVersion: 1,
            pricingSnapshot: {},
            items: {
                create: {
                    tenantUuid: t.tenant.uuid,
                    productUuid: product.uuid,
                    productName: "Latte",
                    quantity: 1,
                    basePrice: 350,
                    optionsCost: 75,
                    unitPrice: 425,
                    subtotal: 425,
                    finalPrice: 425,
                    specialInstructions: "no foam",
                    selectedOptions: [{ groupName: "Milk", optionName: "Oat", optionUuid: crypto.randomUUID(), cost: 75 }],
                },
            },
        },
    });

    const waitFor = async (match: (m: typeof sent[number]) => boolean) => {
        for (let i = 0; i < 50; i++) {
            const found = sent.find(match);
            if (found) return found;
            await new Promise((r) => setTimeout(r, 20));
        }
        return undefined;
    };

    const order = await newOrder();
    await EventBus.emit("ORDER_CREATED", { orderUuid: order.uuid, tenantUuid: t.tenant.uuid, storeUuid: t.store.uuid, totalAmount: 425 });
    check("unpaid order: nothing to the store room", sent.filter((m) => m.room === `store:${t.store.uuid}`).length, 0);
    check("unpaid order: tenant dashboard counts it", sent.some((m) => m.room === `tenant:${t.tenant.uuid}` && m.event === "order:created"), true);

    // Payment confirmed (PaymentService emits the same event)
    await OrderStatusService.transition(order.uuid, "PAID", { changedBy: "test" });
    const ticket = await waitFor((m) => m.room === `store:${t.store.uuid}` && m.event === "order:new");
    const o = ticket?.payload?.order;
    check("PAID: store room gets order:new", !!o, true);
    check("  ticket order number", o?.orderNumber, order.orderNumber);
    check("  ticket item", `${o?.items?.[0]?.quantity}x ${o?.items?.[0]?.productName}`, "1x Latte");
    check("  ticket modifier", `${o?.items?.[0]?.modifiers?.[0]?.groupName}: ${o?.items?.[0]?.modifiers?.[0]?.optionName}`, "Milk: Oat");
    check("  ticket special instructions", o?.items?.[0]?.specialInstructions, "no foam");
    check("  ticket customer name / notes", `${o?.customerName} / ${o?.customerNotes}`, "Kds Customer / extra hot");
    const json = JSON.stringify(o ?? {});
    check("  ticket has no phone number", json.includes("15550001111") || "customerPhone" in (o ?? {}), false);
    check("  ticket has no prices", /cost|price|amount/i.test(json), false);
    check("PAID: customer's room gets order:update", (await waitFor((m) => m.room === `user:${customer.uuid}` && m.payload?.status === "PAID")) !== undefined, true);

    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
        await OrderStatusService.transition(order.uuid, status, { changedBy: "test" });
        const staffMsg = await waitFor((m) => m.room === `store:${t.store.uuid}` && m.event === "order:status-changed" && m.payload?.to === status);
        const customerMsg = await waitFor((m) => m.room === `user:${customer.uuid}` && m.payload?.status === status);
        check(`${status}: store room and customer told`, !!staffMsg && !!customerMsg, true);
    }
    check("COMPLETED: tenant dashboard told", (await waitFor((m) => m.room === `tenant:${t.tenant.uuid}` && m.event === "order:completed")) !== undefined, true);

    const cancelled = await newOrder();
    await OrderCancellationService.cancelBeforePayment({ tenantUuid: t.tenant.uuid, orderUuid: cancelled.uuid, reason: "changed my mind", cancelledBy: "test" });
    check("cancellation broadcast", (await waitFor((m) => m.room === `store:${t.store.uuid}` && m.payload?.orderUuid === cancelled.uuid && m.payload?.to === "CANCELLED")) !== undefined, true);
    check("cancelled order never sent as a ticket", sent.some((m) => m.event === "order:new" && m.payload?.order?.uuid === cancelled.uuid), false);

    const identity = { userUuid: customer.uuid, isSuperAdmin: false };
    check("own user room", await canJoinDashboardRoom(identity, `user:${customer.uuid}`), true);
    check("someone else's user room", await canJoinDashboardRoom(identity, `user:${crypto.randomUUID()}`), false);
    check("super admin, someone else's user room", await canJoinDashboardRoom({ userUuid: crypto.randomUUID(), isSuperAdmin: true }, `user:${customer.uuid}`), false);
}

let exitCode = 0;
try {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }
    console.log(`Run ${runId}`);

    await subscriptions();
    await limits();
    await broadcasts();

    console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nTest crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
