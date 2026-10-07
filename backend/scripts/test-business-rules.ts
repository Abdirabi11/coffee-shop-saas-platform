// LOCAL ORDER BUSINESS-RULE CHECKS
// Calls the order, menu and store-hours services directly against the local
// database and checks the results:
//
//   1. Idempotency-Key payload hash - reusing a key with a different payload
//      (or from a different customer) is rejected with
//      IDEMPOTENCY_KEY_MISMATCH, sequentially and under concurrency.
//   2. Modifier limits - min/max selections (and required groups) are
//      enforced end to end through OrderCommandService.createOrder.
//   3. Store timezone - opening hours, holiday exceptions and menu time
//      slots are evaluated in Store.timezone, not the server's clock. Uses an
//      America/Los_Angeles store with times chosen so the server-clock answer
//      would differ.
//
//   npx tsx scripts/test-business-rules.ts
//
// Reuses the seed-test-payment user/tenant; each run creates its own stores.
// Works with Redis down (orders are then slower: the cache calls time out).
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Quiet the app's logging; must be set before the app modules load, hence the
// dynamic imports.
process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { OrderCommandService } = await import("../src/services/order/OrderCommand.service.ts");
const { MenuService } = await import("../src/services/menu/menu.service.ts");
const { StoreHoursService } = await import("../src/services/store/StoreHours.service.ts");
const { bumpCacheVersion } = await import("../src/infrastructure/cache/cacheVersion.ts");
const { storeLocalTime } = await import("../src/utils/date.ts");

const TEST_TENANT_SLUG = "sim-test-tenant";
const STORE_TZ = "America/Los_Angeles";
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];

async function customer(phoneNumber: string, firstName: string, tenantUuid: string, slug: string) {
    const user = await prisma.user.upsert({
        where: { phoneNumber },
        update: {},
        create: { phoneNumber, firstName, lastName: "Customer" },
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

    const alice = await customer("+10000000001", "Sim", tenant.uuid, "sim-customer");
    const bob = await customer("+10000000002", "Bob", tenant.uuid, "sim-customer-2");
    const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;

    // Orders store: UTC, open 24/7
    const store = await prisma.store.create({
        data: { tenantUuid: tenant.uuid, name: `Rules Store ${runId}`, slug: `rules-${runId}`, city: "Mogadishu" },
    });
    await prisma.storeOpeningHour.createMany({
        data: DAYS.map((day) => ({
            tenantUuid: tenant.uuid, storeUuid: store.uuid, dayOfWeek: day, periods: [], is24Hours: true,
        })),
    });
    const category = await prisma.category.create({
        data: { tenantUuid: tenant.uuid, storeUuid: store.uuid, name: "Rules", slug: "rules" },
    });

    return { tenant, alice, bob, store, category, runId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function product(ctx: Ctx, storeUuid: string, categoryUuid: string, data: Record<string, unknown>) {
    const created = await prisma.product.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid, categoryUuid, basePrice: 350, ...(data as any) },
    });
    // Inserted directly, so invalidate the cached menu like the admin flow
    await bumpCacheVersion(`menu:${storeUuid}`).catch(() => {});
    return created;
}

function order(
    ctx: Ctx,
    opts: {
        productUuid: string;
        quantity?: number;
        modifiers?: { optionUuid: string; quantity?: number }[];
        idempotencyKey?: string;
        tenantUserUuid?: string;
    }
) {
    return OrderCommandService.createOrder({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        tenantUserUuid: opts.tenantUserUuid ?? ctx.alice.tenantUser.uuid,
        orderType: "TAKEAWAY",
        items: [{ productUuid: opts.productUuid, quantity: opts.quantity ?? 1, modifiers: opts.modifiers }],
        idempotencyKey: opts.idempotencyKey,
    });
}

const outcome = (p: Promise<any>) => p.then((o) => `order ${o.uuid}`, (e) => errorCode(e));

async function idempotencyHash(ctx: Ctx) {
    console.log("\n=== 1. Idempotency-Key payload hash ===");
    const latte = await product(ctx, ctx.store.uuid, ctx.category.uuid, { name: "Hash Latte" });
    const key = `rules-${crypto.randomUUID()}`;

    const first = await order(ctx, { productUuid: latte.uuid, idempotencyKey: key });
    check("same key + same payload replays the order", await outcome(order(ctx, { productUuid: latte.uuid, idempotencyKey: key })), `order ${first.uuid}`);
    check("same key + different quantity", await outcome(order(ctx, { productUuid: latte.uuid, quantity: 2, idempotencyKey: key })), "IDEMPOTENCY_KEY_MISMATCH");
    check(
        "same key + same items, different customer",
        await outcome(order(ctx, { productUuid: latte.uuid, idempotencyKey: key, tenantUserUuid: ctx.bob.tenantUser.uuid })),
        "IDEMPOTENCY_KEY_MISMATCH"
    );

    // Concurrent: 3 requests with payload A and 2 with payload B share a key.
    // Exactly one order is created; whichever payload won, its requests get
    // that order and the other payload's requests get a mismatch.
    const mocha = await product(ctx, ctx.store.uuid, ctx.category.uuid, { name: "Hash Mocha" });
    const raceKey = `rules-${crypto.randomUUID()}`;
    const payloads = [1, 1, 1, 2, 2];
    const results = await Promise.all(
        payloads.map((quantity) => outcome(order(ctx, { productUuid: mocha.uuid, quantity, idempotencyKey: raceKey })))
    );
    console.log(`  concurrent outcomes: ${results.map((r, i) => `q${payloads[i]}→${r.startsWith("order") ? "order" : r}`).join(", ")}`);

    const orders = await prisma.order.findMany({
        where: { storeUuid: ctx.store.uuid, items: { some: { productUuid: mocha.uuid } } },
        include: { items: true },
    });
    const winnerQty = orders[0]?.items[0]?.quantity;
    check("orders created for the shared key", orders.length, 1);
    check(
        "winning payload's requests all got the order",
        results.every((r, i) => (payloads[i] === winnerQty ? r === `order ${orders[0].uuid}` : true)),
        true
    );
    check(
        "losing payload's requests all got IDEMPOTENCY_KEY_MISMATCH",
        results.every((r, i) => (payloads[i] !== winnerQty ? r === "IDEMPOTENCY_KEY_MISMATCH" : true)),
        true
    );
}

async function modifierLimits(ctx: Ctx) {
    console.log("\n=== 2. Modifier min/max selections ===");
    const drink = await product(ctx, ctx.store.uuid, ctx.category.uuid, { name: "Modifier Flat White" });

    const group = async (name: string, data: Record<string, unknown>, options: { name: string; extraCost: number }[]) => {
        const g = await prisma.optionGroup.create({
            data: {
                tenantUuid: ctx.tenant.uuid,
                storeUuid: ctx.store.uuid,
                name,
                ...(data as any),
                options: { create: options },
            },
            include: { options: true },
        });
        await prisma.productOptionGroup.create({
            data: { tenantUuid: ctx.tenant.uuid, productUuid: drink.uuid, optionGroupUuid: g.uuid, name },
        });
        return Object.fromEntries(g.options.map((o) => [o.name, o.uuid]));
    };

    // Size: pick exactly one (required, SINGLE). Extras: up to 2, optional.
    const size = await group("Size", { selectionType: "SINGLE", isRequired: true, minSelections: 1 }, [
        { name: "Small", extraCost: 0 },
        { name: "Large", extraCost: 100 },
    ]);
    const extras = await group("Extras", { selectionType: "MULTIPLE", minSelections: 0, maxSelections: 2 }, [
        { name: "Shot", extraCost: 50 },
        { name: "Syrup", extraCost: 30 },
    ]);
    await bumpCacheVersion(`menu:${ctx.store.uuid}`).catch(() => {});

    const attempt = (modifiers: { optionUuid: string; quantity?: number }[]) =>
        order(ctx, { productUuid: drink.uuid, modifiers }).then(
            (o) => `order ${o.totalAmount}`,
            (e) => e.message
        );

    const missing = await attempt([{ optionUuid: extras.Shot }]);
    check("required size missing → INVALID_MODIFIERS", errorCode(missing), "INVALID_MODIFIERS");
    console.log(`        ${missing}`);

    const twoSizes = await attempt([{ optionUuid: size.Small }, { optionUuid: size.Large }]);
    check("two sizes in a single-choice group → INVALID_MODIFIERS", errorCode(twoSizes), "INVALID_MODIFIERS");
    console.log(`        ${twoSizes}`);

    const threeShots = await attempt([{ optionUuid: size.Small }, { optionUuid: extras.Shot, quantity: 3 }]);
    check("3 extras where max is 2 (via quantity) → INVALID_MODIFIERS", errorCode(threeShots), "INVALID_MODIFIERS");
    console.log(`        ${threeShots}`);

    const foreign = await attempt([{ optionUuid: size.Small }, { optionUuid: crypto.randomUUID() }]);
    check("option not on this product → INVALID_MODIFIERS", errorCode(foreign), "INVALID_MODIFIERS");

    const valid = await attempt([{ optionUuid: size.Large }, { optionUuid: extras.Shot }, { optionUuid: extras.Syrup }]);
    check("Large + Shot + Syrup accepted, total 350+100+50+30", valid, "order 530");

    const item = await prisma.orderItem.findFirst({
        where: { productUuid: drink.uuid },
        orderBy: { createdAt: "desc" },
    });
    const groupNames = ((item?.selectedOptions as any[]) ?? []).map((o) => o.groupName).join(",");
    check("selectedOptions carry their group names", groupNames, "Size,Extras,Extras");
}

async function storeTimezone(ctx: Ctx) {
    console.log(`\n=== 3. Store timezone (${STORE_TZ}, server ${Intl.DateTimeFormat().resolvedOptions().timeZone}) ===`);
    const store = await prisma.store.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            name: `Rules TZ Store ${ctx.runId}`,
            slug: `rules-tz-${ctx.runId}`,
            city: "Los Angeles",
            timezone: STORE_TZ,
        },
    });

    // Tuesday open 24h, Wednesday closed, other days 09:00-17:00 local
    await prisma.storeOpeningHour.createMany({
        data: DAYS.map((day) => ({
            tenantUuid: ctx.tenant.uuid,
            storeUuid: store.uuid,
            dayOfWeek: day,
            periods: [],
            ...(day === "TUESDAY" ? { is24Hours: true } : day === "WEDNESDAY" ? { isClosed: true } : { openTime: "09:00", closeTime: "17:00" }),
        })),
    });
    // Closed for a holiday on Saturday 2026-10-10 (stored as UTC midnight,
    // as Store.controller does with new Date("2026-10-10"))
    await prisma.storeHourException.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: store.uuid,
            exceptionDate: new Date("2026-10-10"),
            exceptionType: "HOLIDAY",
            name: "Test holiday",
            isClosed: true,
        },
    });

    const cases: Array<[string, string, boolean]> = [
        ["2026-10-07T05:00:00Z", "Tue 22:00 LA (already Wed on a UTC+3 server)", true],
        ["2026-10-07T17:00:00Z", "Wed 10:00 LA (closed all Wednesday)", false],
        ["2026-10-09T17:00:00Z", "Fri 10:00 LA (20:00 on a UTC+3 server)", true],
        ["2026-10-09T08:00:00Z", "Fri 01:00 LA (11:00 on a UTC+3 server)", false],
        ["2026-10-10T17:00:00Z", "Sat 10:00 LA, holiday exception", false],
        ["2026-10-11T03:30:00Z", "Sat 20:30 LA (already Sun on UTC), after hours", false],
        ["2026-10-11T16:30:00Z", "Sun 09:30 LA, day after the holiday", true],
    ];
    for (const [iso, label, expected] of cases) {
        check(`isStoreOpen ${label}`, await StoreHoursService.isStoreOpen(store.uuid, new Date(iso)), expected);
    }

    // Menu time slots: one product available during the current store-local
    // hour, one during the current server-local hour. Only the first is live.
    const category = await prisma.category.create({
        data: { tenantUuid: ctx.tenant.uuid, storeUuid: store.uuid, name: "TZ", slug: "tz" },
    });
    const now = new Date();
    const storeHour = storeLocalTime(now, STORE_TZ).time.slice(0, 2);
    const serverHour = String(now.getHours()).padStart(2, "0");
    const slot = (hour: string) => [{ start: `${hour}:00`, end: `${hour}:59` }];

    const storeSlot = await product(ctx, store.uuid, category.uuid, { name: "Store-hour Special", timeSlots: slot(storeHour) });
    const serverSlot = await product(ctx, store.uuid, category.uuid, { name: "Server-hour Special", timeSlots: slot(serverHour) });
    const today = await product(ctx, store.uuid, category.uuid, {
        name: "Store-day Special",
        availableDays: [storeLocalTime(now, STORE_TZ).dayName],
    });

    const menu = await MenuService.getStoreMenu({ tenantUuid: ctx.tenant.uuid, storeUuid: store.uuid });
    const listed = new Set(menu.categories.flatMap((c: any) => c.products.map((p: any) => p.uuid)));
    console.log(`  store-local hour ${storeHour}, server-local hour ${serverHour}`);
    check("menu lists product slotted for the store-local hour", listed.has(storeSlot.uuid), true);
    check("menu hides product slotted for the server-local hour", listed.has(serverSlot.uuid), storeHour === serverHour);
    check("menu lists product limited to the store-local weekday", listed.has(today.uuid), true);

    const single = await MenuService.getProduct({ tenantUuid: ctx.tenant.uuid, storeUuid: store.uuid, productUuid: serverSlot.uuid });
    check("getProduct marks the server-hour product unavailable", single.isAvailable, storeHour === serverHour);
}

async function main() {
    const ctx = await setup();
    console.log("Order business-rule checks");
    console.log(`  tenant: ${ctx.tenant.uuid} (${ctx.tenant.slug})`);
    console.log(`  store:  ${ctx.store.uuid} (${ctx.store.slug})`);

    await idempotencyHash(ctx);
    await modifierLimits(ctx);
    await storeTimezone(ctx);

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-business-rules failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
