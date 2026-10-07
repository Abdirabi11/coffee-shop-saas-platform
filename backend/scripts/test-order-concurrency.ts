// LOCAL ORDER CONCURRENCY & IDEMPOTENCY STRESS TEST
// Calls the order services directly (no HTTP, so no auth or rate limits)
// against the local database and checks the results in the database itself.
//
//   Scenario A  (idempotency) - N concurrent OrderSyncService.syncFromClient
//               calls with the same clientOrderUuid → exactly 1 order, 1
//               reservation, 1 unit of stock taken; the rest are replays.
//   Scenario B  (overselling) - 10 concurrent syncs, 1 unit each, against a
//               product with 3 in stock → 3 succeed, 7 OUT_OF_STOCK, stock 0.
//   Scenario B2 (raw inventory race) - same as B but calling
//               InventoryOrderService.reserveForOrder directly. Order creation
//               holds a per-tenant advisory lock (OrderNumberService), which
//               queues B's transactions one after another; B2 drops that lock so
//               the conditional decrement itself is what stops overselling.
//   Scenario C  (Idempotency-Key) - N concurrent OrderCommandService.createOrder
//               calls (the POST /orders path) with the same idempotency key →
//               exactly 1 order, every caller gets it back. Then a request
//               that fails (OUT_OF_STOCK) must not leave its key claimed.
//
//   npx tsx scripts/test-order-concurrency.ts
//   npx tsx scripts/test-order-concurrency.ts --dupes 20 --stock 5 --orders 25
//   npx tsx scripts/test-order-concurrency.ts --real-redis   # no stand-in, even if Redis is down
//
// Reuses the seed-test-payment user/tenant; each run creates its own store,
// category and products so runs never share stock or menu cache entries.
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";

// The menu load behind order pricing reads a cache version from Redis with no
// fallback (getCacheVersion), so an unreachable Redis fails every order with
// MENU_FETCH_FAILED. This test is about database atomicity, so in that case
// point the app's Upstash client at a minimal in-memory Upstash REST server.
// Must run before src/lib/redis.ts is imported.
async function upstashReachable(): Promise<boolean> {
    try {
        const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
            headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function startFakeUpstash(): Promise<http.Server> {
    const data = new Map<string, string>();
    const run = ([cmd, ...args]: string[]): unknown => {
        switch (cmd.toUpperCase()) {
            case "PING": return "PONG";
            case "GET": return data.get(args[0]) ?? null;
            case "SET": data.set(args[0], String(args[1])); return "OK";
            case "DEL": return args.filter((k) => data.delete(k)).length;
            case "INCR": {
                const next = Number(data.get(args[0]) ?? 0) + 1;
                data.set(args[0], String(next));
                return next;
            }
            default: return 1; // SADD / EXPIRE: tag bookkeeping, irrelevant here
        }
    };
    // The client asks for base64 responses and decodes every string but "OK"
    const encode = (v: unknown) => (typeof v === "string" && v !== "OK" ? Buffer.from(v).toString("base64") : v);

    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            const parsed = JSON.parse(body || "[]");
            const batch = req.url?.startsWith("/pipeline") || req.url?.startsWith("/multi-exec");
            const out = batch
                ? parsed.map((c: string[]) => ({ result: encode(run(c)) }))
                : { result: encode(run(parsed)) };
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(out));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
}

let fakeUpstash: http.Server | undefined;
if (!process.argv.includes("--real-redis") && !(await upstashReachable())) {
    fakeUpstash = await startFakeUpstash();
    process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(fakeUpstash.address() as AddressInfo).port}`;
}

// Quiet the app's logging; must be set before the app modules load, hence the
// dynamic imports. Prisma logging stays off because the expected OUT_OF_STOCK
// rejections are P2025 errors that would each print a stack excerpt.
process.env.LOG_LEVEL ??= "error";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { OrderSyncService } = await import("../src/services/sync/OrderSync.service.ts");
const { InventoryOrderService } = await import("../src/services/inventory/InventoryOrder.service.ts");
const { OrderCommandService } = await import("../src/services/order/OrderCommand.service.ts");
const { bumpCacheVersion } = await import("../src/infrastructure/cache/cacheVersion.ts");

const TEST_PHONE = "+10000000001";
const TEST_TENANT_SLUG = "sim-test-tenant";

function arg(name: string, fallback: number): number {
    const i = process.argv.indexOf(`--${name}`);
    const value = i === -1 ? fallback : Number(process.argv[i + 1]);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
}

const DUPES = arg("dupes", 5);
const STOCK = arg("stock", 3);
const ORDERS = arg("orders", 10);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

function errorCode(message: string | undefined): string {
    return (message ?? "UNKNOWN").split(":")[0];
}

function tally(values: string[]): string {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${k} x${n}`).join(", ");
}

async function setup() {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
        throw new Error(`Refusing to run against non-local database host "${dbHost}"`);
    }

    const user = await prisma.user.upsert({
        where: { phoneNumber: TEST_PHONE },
        update: {},
        create: { phoneNumber: TEST_PHONE, firstName: "Sim", lastName: "Customer" },
    });

    const tenant = await prisma.tenant.upsert({
        where: { slug: TEST_TENANT_SLUG },
        update: {},
        create: {
            name: "Simulation Coffee Co",
            slug: TEST_TENANT_SLUG,
            email: "sim-tenant@example.test",
            ownerUuid: user.uuid,
        },
    });

    const tenantUser =
        (await prisma.tenantUser.findFirst({ where: { tenantUuid: tenant.uuid, userUuid: user.uuid } })) ??
        (await prisma.tenantUser.create({
            data: { tenantUuid: tenant.uuid, userUuid: user.uuid, slug: "sim-customer" },
        }));

    const runId = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;

    const store = await prisma.store.create({
        data: {
            tenantUuid: tenant.uuid,
            name: `Concurrency Store ${runId}`,
            slug: `concurrency-${runId}`,
            city: "Mogadishu",
        },
    });

    // OrderSyncService.assertStoreAccess requires an active assignment
    await prisma.userStore.create({
        data: {
            userUuid: user.uuid,
            storeUuid: store.uuid,
            tenantUserUuid: tenantUser.uuid,
            tenantUuid: tenant.uuid,
        },
    });

    // OrderCommandService refuses orders outside opening hours: open 24/7
    await prisma.storeOpeningHour.createMany({
        data: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
            tenantUuid: tenant.uuid,
            storeUuid: store.uuid,
            dayOfWeek: day as any,
            periods: [],
            is24Hours: true,
        })),
    });

    // Products only reach the menu (and so pricing) through a category
    const category = await prisma.category.create({
        data: { tenantUuid: tenant.uuid, storeUuid: store.uuid, name: "Stress Test", slug: "stress-test" },
    });

    return { user, tenant, tenantUser, store, category, runId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function createStockedProduct(ctx: Ctx, name: string, stock: number) {
    const product = await prisma.product.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            categoryUuid: ctx.category.uuid,
            name,
            basePrice: 350,
            trackInventory: true,
            currentStock: stock,
        },
    });

    await prisma.inventoryItem.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            productUuid: product.uuid,
            quantity: stock,
            currentStock: stock,
            availableStock: stock,
        },
    });

    // Products are inserted directly, so invalidate the cached menu the way
    // the admin product flow does; otherwise pricing can't see the product.
    // Like MenuCacheService.invalidate, tolerate a failure: with Redis down,
    // getCacheVersion bypasses the cache anyway.
    await bumpCacheVersion(`menu:${ctx.store.uuid}`).catch(() => {});

    return product;
}

function syncOrder(ctx: Ctx, clientOrderUuid: string, productUuid: string) {
    const now = new Date().toISOString();
    return OrderSyncService.syncFromClient({
        tenantUuid: ctx.tenant.uuid,
        tenantUserUuid: ctx.tenantUser.uuid,
        userUuid: ctx.user.uuid,
        deviceId: "concurrency-test",
        clientOrder: {
            clientOrderUuid,
            storeUuid: ctx.store.uuid,
            orderType: "TAKEAWAY",
            items: [{ productUuid, quantity: 1 }],
            status: "PENDING",
            createdAt: now,
            lastModifiedAt: now,
        },
    });
}

async function inventoryState(productUuid: string) {
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { productUuid } });
    const reservations = await prisma.inventoryReservation.count({
        where: { inventoryItemUuid: inventory.uuid, status: "ACTIVE" },
    });
    return { ...inventory, reservations };
}

async function scenarioA(ctx: Ctx) {
    console.log(`\n=== Scenario A: ${DUPES} concurrent syncs, same clientOrderUuid ===`);
    const stock = 10;
    const product = await createStockedProduct(ctx, "Idempotency Latte", stock);
    const clientOrderUuid = crypto.randomUUID();

    const started = Date.now();
    const results = await Promise.allSettled(
        Array.from({ length: DUPES }, () => syncOrder(ctx, clientOrderUuid, product.uuid))
    );
    console.log(`  ${DUPES} requests settled in ${Date.now() - started}ms`);

    const outcomes = results.map((r) =>
        r.status === "rejected"
            ? `THREW ${errorCode(r.reason?.message)}`
            : r.value.success
              ? r.value.replayed ? "replayed" : "created"
              : `FAILED ${errorCode(r.value.error)}`
    );
    console.log(`  outcomes: ${tally(outcomes)}`);

    const returnedUuids = new Set(
        results.flatMap((r) => (r.status === "fulfilled" && r.value.serverOrderUuid ? [r.value.serverOrderUuid] : []))
    );
    const orders = await prisma.order.count({ where: { uuid: clientOrderUuid } });
    const items = await prisma.orderItem.count({ where: { orderUuid: clientOrderUuid } });
    const inventory = await inventoryState(product.uuid);

    check("requests that created an order", outcomes.filter((o) => o === "created").length, 1);
    check("requests replayed", outcomes.filter((o) => o === "replayed").length, DUPES - 1);
    check("distinct order uuids returned", returnedUuids.size, 1);
    check("returned uuid == clientOrderUuid", [...returnedUuids][0], clientOrderUuid);
    check("orders in DB with that uuid", orders, 1);
    check("order items in DB", items, 1);
    check("active reservations", inventory.reservations, 1);
    check("availableStock", inventory.availableStock, stock - 1);
    check("reservedStock", inventory.reservedStock, 1);
}

async function scenarioB(ctx: Ctx) {
    console.log(`\n=== Scenario B: ${ORDERS} concurrent syncs, 1 unit each, stock ${STOCK} ===`);
    const product = await createStockedProduct(ctx, "Limited Cold Brew", STOCK);
    const clientOrderUuids = Array.from({ length: ORDERS }, () => crypto.randomUUID());

    const started = Date.now();
    const results = await Promise.allSettled(clientOrderUuids.map((uuid) => syncOrder(ctx, uuid, product.uuid)));
    console.log(`  ${ORDERS} requests settled in ${Date.now() - started}ms`);

    const outcomes = results.map((r) =>
        r.status === "rejected"
            ? `THREW ${errorCode(r.reason?.message)}`
            : r.value.success ? "created" : errorCode(r.value.error)
    );
    console.log(`  outcomes: ${tally(outcomes)}`);

    const expectedOk = Math.min(STOCK, ORDERS);
    const orders = await prisma.order.count({ where: { uuid: { in: clientOrderUuids } } });
    const items = await prisma.orderItem.count({ where: { orderUuid: { in: clientOrderUuids } } });
    const inventory = await inventoryState(product.uuid);

    check("orders created", outcomes.filter((o) => o === "created").length, expectedOk);
    check("rejected with OUT_OF_STOCK", outcomes.filter((o) => o === "OUT_OF_STOCK").length, ORDERS - expectedOk);
    check("orders in DB (rejects rolled back)", orders, expectedOk);
    check("order items in DB", items, expectedOk);
    check("active reservations", inventory.reservations, expectedOk);
    check("availableStock", inventory.availableStock, STOCK - expectedOk);
    check("reservedStock", inventory.reservedStock, expectedOk);
}

async function scenarioB2(ctx: Ctx) {
    console.log(`\n=== Scenario B2: ${ORDERS} concurrent reserveForOrder calls (no order-number lock), stock ${STOCK} ===`);
    const product = await createStockedProduct(ctx, "Raw Race Espresso", STOCK);

    // Plain PENDING orders with no reservation yet, created sequentially
    const orderUuids: string[] = [];
    for (let i = 0; i < ORDERS; i++) {
        const order = await prisma.order.create({
            data: {
                tenantUuid: ctx.tenant.uuid,
                storeUuid: ctx.store.uuid,
                tenantUserUuid: ctx.tenantUser.uuid,
                orderNumber: `RACE-${ctx.runId}-${i}`,
                status: "PENDING",
                paymentStatus: "PENDING",
                currency: "USD",
                subtotal: 350,
                totalAmount: 350,
                menuVersion: 1,
                pricingSnapshot: { items: [], calculations: { subtotal: 350, total: 350 } },
            },
        });
        orderUuids.push(order.uuid);
    }

    const started = Date.now();
    const results = await Promise.allSettled(
        orderUuids.map((orderUuid) =>
            InventoryOrderService.reserveForOrder({
                tenantUuid: ctx.tenant.uuid,
                storeUuid: ctx.store.uuid,
                orderUuid,
                items: [{ productUuid: product.uuid, quantity: 1 }],
            })
        )
    );
    console.log(`  ${ORDERS} reservations settled in ${Date.now() - started}ms`);

    const outcomes = results.map((r) => (r.status === "fulfilled" ? "reserved" : errorCode(r.reason?.message)));
    console.log(`  outcomes: ${tally(outcomes)}`);

    const expectedOk = Math.min(STOCK, ORDERS);
    const inventory = await inventoryState(product.uuid);

    check("reservations succeeded", outcomes.filter((o) => o === "reserved").length, expectedOk);
    check("rejected with OUT_OF_STOCK", outcomes.filter((o) => o === "OUT_OF_STOCK").length, ORDERS - expectedOk);
    check("active reservations", inventory.reservations, expectedOk);
    check("availableStock", inventory.availableStock, STOCK - expectedOk);
    check("reservedStock", inventory.reservedStock, expectedOk);
}

function commandOrder(ctx: Ctx, idempotencyKey: string, productUuid: string) {
    return OrderCommandService.createOrder({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        tenantUserUuid: ctx.tenantUser.uuid,
        orderType: "TAKEAWAY",
        items: [{ productUuid, quantity: 1 }],
        idempotencyKey,
    });
}

async function scenarioC(ctx: Ctx) {
    console.log(`\n=== Scenario C: ${DUPES} concurrent createOrder calls, same Idempotency-Key ===`);
    const stock = 10;
    const product = await createStockedProduct(ctx, "Idempotency Mocha", stock);
    const key = `stress-${crypto.randomUUID()}`;

    const started = Date.now();
    const results = await Promise.allSettled(
        Array.from({ length: DUPES }, () => commandOrder(ctx, key, product.uuid))
    );
    console.log(`  ${DUPES} requests settled in ${Date.now() - started}ms`);

    const outcomes = results.map((r) => (r.status === "fulfilled" ? "returned order" : `THREW ${errorCode(r.reason?.message)}`));
    console.log(`  outcomes: ${tally(outcomes)}`);

    const returnedUuids = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value.uuid] : [])));
    const orders = await prisma.order.count({ where: { storeUuid: ctx.store.uuid, items: { some: { productUuid: product.uuid } } } });
    const keyRow = await prisma.idempotencyKey.findUnique({
        where: { tenantUuid_key_route: { tenantUuid: ctx.tenant.uuid, key, route: "POST /orders" } },
    });
    const inventory = await inventoryState(product.uuid);

    check("requests that returned an order", outcomes.filter((o) => o === "returned order").length, DUPES);
    check("distinct order uuids returned", returnedUuids.size, 1);
    check("orders in DB for the product", orders, 1);
    check("idempotency key stored order uuid", (keyRow?.response as any)?.uuid, [...returnedUuids][0]);
    check("idempotency key statusCode", keyRow?.statusCode, 201);
    check("active reservations", inventory.reservations, 1);
    check("availableStock", inventory.availableStock, stock - 1);

    // A failed request must release its claim so the client can retry
    const soldOut = await createStockedProduct(ctx, "Sold Out Scone", 0);
    const failedKey = `stress-${crypto.randomUUID()}`;
    const failed = await commandOrder(ctx, failedKey, soldOut.uuid).then(() => "created", (e) => errorCode(e.message));
    const failedKeyRows = await prisma.idempotencyKey.count({ where: { tenantUuid: ctx.tenant.uuid, key: failedKey } });
    check("sold-out request rejected", failed, "OUT_OF_STOCK");
    check("idempotency key rows left by the failed request", failedKeyRows, 0);
}

async function main() {
    const ctx = await setup();
    console.log("Order concurrency stress test");
    if (fakeUpstash) {
        console.log("  WARNING: Upstash Redis unreachable - menu cache served by an in-memory stand-in");
    }
    console.log(`  tenant: ${ctx.tenant.uuid} (${ctx.tenant.slug})`);
    console.log(`  store:  ${ctx.store.uuid} (${ctx.store.slug})`);

    await scenarioA(ctx);
    await scenarioB(ctx);
    await scenarioB2(ctx);
    await scenarioC(ctx);

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(`test-order-concurrency failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        fakeUpstash?.close();
        await prisma.$disconnect();
    });
