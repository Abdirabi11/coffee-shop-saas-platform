// LOCAL INVENTORY RACE CHECKS
// Calls the inventory services directly against the local database and checks
// the stock rows, reservations and movements they leave behind:
//
//   1. Commit vs release - a payment confirmation (commitForOrder) and the
//      expiry job (releaseForOrder) hit the same order at once. The order is
//      sold exactly once and nothing stays reserved, whichever runs first.
//   2. Double commit - concurrent commits of one order sell the stock once.
//   3. Late payment - the reservation lapsed before the payment landed: the
//      commit takes the stock again, or fails with OUT_OF_STOCK if another
//      order has it, instead of silently recording nothing.
//   4. Status - a sale that keeps an item below its reorder point leaves it
//      LOW_STOCK (it used to be reset to IN_STOCK); a restock clears it.
//   5. Manual adjustments vs reservations - concurrent adjustStock calls and
//      order reservations on one item all count; a deduction can't take
//      reserved stock; concurrent deductions raise one low-stock alert.
//   6. releaseStock - exists, and repeated concurrent calls release once.
//   7. Expiry job - releases unpaid orders, commits paid ones it finds still
//      reserved (their commit never ran) instead of putting sold stock back.
//
//   npx tsx scripts/test-inventory-races.ts
//   npx tsx scripts/test-inventory-races.ts --trials 50
//
// Reuses the seed-test-payment tenant; each run creates its own store and
// products. The expiry job scans every expired reservation in the database,
// so leftovers from other local runs get processed too.
// Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// Nothing here needs Redis, but importing the app modules connects to it
const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { InventoryOrderService } = await import("../src/services/inventory/InventoryOrder.service.ts");
const { InventoryService } = await import("../src/services/inventory/inventory.service.ts");
const { ReservationExpiryJob } = await import("../src/jobs/Inventory/ReservationExpiry.job.ts");
const { eventBus } = await import("../src/events/eventBus.ts");

const TEST_PHONE = "+10000000001";
const TEST_TENANT_SLUG = "sim-test-tenant";

function arg(name: string, fallback: number): number {
    const i = process.argv.indexOf(`--${name}`);
    const value = i === -1 ? fallback : Number(process.argv[i + 1]);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
}

const TRIALS = arg("trials", 20);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const errorCode = (e: any) => String(e?.message ?? e).split(":")[0];

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
            name: `Inventory Race Store ${runId}`,
            slug: `inventory-race-${runId}`,
            city: "Mogadishu",
        },
    });

    const category = await prisma.category.create({
        data: { tenantUuid: tenant.uuid, storeUuid: store.uuid, name: "Race Test", slug: "race-test" },
    });

    return { tenant, tenantUser, store, category, runId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function stockedProduct(ctx: Ctx, stock: number, opts: { reorderPoint?: number; status?: any } = {}) {
    const product = await prisma.product.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            categoryUuid: ctx.category.uuid,
            name: `Race Product ${crypto.randomBytes(3).toString("hex")}`,
            basePrice: 350,
            trackInventory: true,
            currentStock: stock,
        },
    });

    const item = await prisma.inventoryItem.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            productUuid: product.uuid,
            quantity: stock,
            currentStock: stock,
            availableStock: stock,
            reorderPoint: opts.reorderPoint,
            status: opts.status,
        },
    });

    return { product, item };
}

// An unpaid order for `quantity` of the product, with its stock reserved the
// way OrderCommandService.createOrder does it
async function reservedOrder(ctx: Ctx, productUuid: string, quantity: number) {
    const order = await prisma.order.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            tenantUserUuid: ctx.tenantUser.uuid,
            orderNumber: `RACE-${ctx.runId}-${crypto.randomBytes(4).toString("hex")}`,
            subtotal: 350 * quantity,
            totalAmount: 350 * quantity,
            menuVersion: 1,
            pricingSnapshot: {},
            items: {
                create: {
                    tenantUuid: ctx.tenant.uuid,
                    productUuid,
                    productName: "Race Product",
                    basePrice: 350,
                    quantity,
                    unitPrice: 350,
                    subtotal: 350 * quantity,
                    finalPrice: 350 * quantity,
                },
            },
        },
    });

    await InventoryOrderService.reserveForOrder({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        orderUuid: order.uuid,
        items: [{ productUuid, quantity }],
    });

    return order;
}

const stockOf = (uuid: string) =>
    prisma.inventoryItem.findUniqueOrThrow({
        where: { uuid },
        select: { currentStock: true, reservedStock: true, availableStock: true, status: true, lowStockAlertSent: true },
    });

const settle = <T>(p: Promise<T>) => p.then(() => "ok", (e) => errorCode(e));

// 1. Payment confirmation and the expiry job on the same order at once
async function commitVsRelease(ctx: Ctx) {
    console.log(`\n1. Commit vs release, ${TRIALS} trials (stock 10, order of 2)`);

    const outcomes: string[] = [];
    let inconsistent = 0;

    for (let i = 0; i < TRIALS; i++) {
        const { product, item } = await stockedProduct(ctx, 10);
        const order = await reservedOrder(ctx, product.uuid, 2);

        await Promise.all([
            settle(InventoryOrderService.commitForOrder({ orderUuid: order.uuid })),
            settle(InventoryOrderService.releaseForOrder({ orderUuid: order.uuid })),
        ]);

        // Whichever runs first, the payment is real, so the order ends up sold
        // exactly once: committed from its reservation, or (release first)
        // taken again at payment
        const [reservation] = await prisma.inventoryReservation.findMany({ where: { orderUuid: order.uuid } });
        const stock = await stockOf(item.uuid);
        const sales = await prisma.inventoryMovement.count({ where: { referenceUuid: order.uuid, type: "SALE" } });
        outcomes.push(reservation.status === "COMMITTED" ? "commit first" : "release first");

        if (stock.currentStock !== 8 || stock.reservedStock !== 0 || stock.availableStock !== 8 || sales !== 1) {
            inconsistent++;
            console.log(`    trial ${i}: reservation ${reservation.status}, ${sales} sale(s), stock`, stock);
        }
    }

    console.log(`    outcomes: ${tally(outcomes)}`);
    check("trials sold exactly once with nothing left reserved", TRIALS - inconsistent, TRIALS);
}

// 2. The same payment confirmed twice at once
async function doubleCommit(ctx: Ctx) {
    console.log("\n2. Concurrent double commit (stock 10, order of 2, 5 commits)");

    const { product, item } = await stockedProduct(ctx, 10);
    const order = await reservedOrder(ctx, product.uuid, 2);

    const results = await Promise.all(
        Array.from({ length: 5 }, () => settle(InventoryOrderService.commitForOrder({ orderUuid: order.uuid })))
    );
    console.log(`    results: ${tally(results)}`);

    const stock = await stockOf(item.uuid);
    const sales = await prisma.inventoryMovement.count({ where: { referenceUuid: order.uuid, type: "SALE" } });
    check("currentStock", stock.currentStock, 8);
    check("reservedStock", stock.reservedStock, 0);
    check("SALE movements", sales, 1);
}

// 3. Payment lands after the reservation lapsed
async function latePayment(ctx: Ctx) {
    console.log("\n3. Late payment");

    {
        const { product, item } = await stockedProduct(ctx, 10);
        const order = await reservedOrder(ctx, product.uuid, 2);
        await InventoryOrderService.releaseForOrder({ orderUuid: order.uuid }); // expired

        const result = await InventoryOrderService.commitForOrder({ orderUuid: order.uuid });
        const stock = await stockOf(item.uuid);
        const committed = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid }, select: { inventoryCommitted: true } });
        check("stock still there: retaken at payment", result.retaken, 1);
        check("  currentStock", stock.currentStock, 8);
        check("  availableStock", stock.availableStock, 8);
        check("  reservedStock", stock.reservedStock, 0);
        check("  order.inventoryCommitted", committed.inventoryCommitted, true);
    }

    {
        const { product, item } = await stockedProduct(ctx, 1);
        const late = await reservedOrder(ctx, product.uuid, 1);
        await InventoryOrderService.releaseForOrder({ orderUuid: late.uuid }); // expired
        await reservedOrder(ctx, product.uuid, 1); // someone else takes the last unit

        const outcome = await settle(InventoryOrderService.commitForOrder({ orderUuid: late.uuid }));
        const stock = await stockOf(item.uuid);
        const committed = await prisma.order.findUniqueOrThrow({ where: { uuid: late.uuid }, select: { inventoryCommitted: true } });
        check("stock gone: commit fails", outcome, "OUT_OF_STOCK");
        check("  other order's reservation untouched (reservedStock)", stock.reservedStock, 1);
        check("  currentStock", stock.currentStock, 1);
        check("  order.inventoryCommitted", committed.inventoryCommitted, false);
    }
}

// 4. LOW_STOCK survives a sale and clears on restock
async function lowStockStatus(ctx: Ctx) {
    console.log("\n4. Status (stock 4, reorder point 5)");

    const { product, item } = await stockedProduct(ctx, 4, { reorderPoint: 5, status: "LOW_STOCK" });

    const first = await reservedOrder(ctx, product.uuid, 1);
    await InventoryOrderService.commitForOrder({ orderUuid: first.uuid });
    check("after selling 1 (3 left)", (await stockOf(item.uuid)).status, "LOW_STOCK");

    const second = await reservedOrder(ctx, product.uuid, 3);
    await InventoryOrderService.commitForOrder({ orderUuid: second.uuid });
    check("after selling the last 3", (await stockOf(item.uuid)).status, "OUT_OF_STOCK");

    await InventoryService.adjustStock({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        productUuid: product.uuid,
        quantity: 10,
        type: "RESTOCK",
        reason: "race test restock",
        adjustedBy: "race-test",
    });
    const restocked = await stockOf(item.uuid);
    check("after restocking 10", restocked.status, "IN_STOCK");
    check("  currentStock", restocked.currentStock, 10);

    const discontinued = await stockedProduct(ctx, 5, { status: "DISCONTINUED" });
    await InventoryService.adjustStock({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        productUuid: discontinued.product.uuid,
        quantity: -5,
        type: "WASTE",
        reason: "race test",
        adjustedBy: "race-test",
    });
    check("DISCONTINUED left alone at 0 stock", (await stockOf(discontinued.item.uuid)).status, "DISCONTINUED");
}

function adjust(ctx: Ctx, productUuid: string, quantity: number) {
    return InventoryService.adjustStock({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        productUuid,
        quantity,
        type: quantity > 0 ? "RESTOCK" : "WASTE",
        reason: "race test",
        adjustedBy: "race-test",
    });
}

// 5. Manual adjustments landing alongside order reservations
async function adjustVsReservations(ctx: Ctx) {
    console.log("\n5. adjustStock vs reservations");

    {
        // 20 in stock; 10 orders reserve 1 each while a manager writes off
        // 5 (-1 x5) and restocks 10 (+2 x5), all at once
        const { product, item } = await stockedProduct(ctx, 20);
        const orders = await Promise.all(
            Array.from({ length: 10 }, async () => {
                const order = await prisma.order.create({
                    data: {
                        tenantUuid: ctx.tenant.uuid,
                        storeUuid: ctx.store.uuid,
                        tenantUserUuid: ctx.tenantUser.uuid,
                        orderNumber: `RACE-${ctx.runId}-${crypto.randomBytes(4).toString("hex")}`,
                        subtotal: 350,
                        totalAmount: 350,
                        menuVersion: 1,
                        pricingSnapshot: {},
                    },
                });
                return order.uuid;
            })
        );

        const results = await Promise.all([
            ...orders.map((orderUuid) => settle(InventoryOrderService.reserveForOrder({
                tenantUuid: ctx.tenant.uuid,
                storeUuid: ctx.store.uuid,
                orderUuid,
                items: [{ productUuid: product.uuid, quantity: 1 }],
            }))),
            ...Array.from({ length: 5 }, () => settle(adjust(ctx, product.uuid, -1))),
            ...Array.from({ length: 5 }, () => settle(adjust(ctx, product.uuid, 2))),
        ]);
        console.log(`    results: ${tally(results)}`);

        const stock = await stockOf(item.uuid);
        check("currentStock (20 - 5 + 10)", stock.currentStock, 25);
        check("reservedStock (10 orders)", stock.reservedStock, 10);
        check("availableStock (current - reserved)", stock.availableStock, 15);
    }

    {
        const { product, item } = await stockedProduct(ctx, 5);
        await reservedOrder(ctx, product.uuid, 4);

        check("deducting 2 of 5 with 4 reserved", await settle(adjust(ctx, product.uuid, -2)), "INSUFFICIENT_STOCK");
        check("deducting 1 of 5 with 4 reserved", await settle(adjust(ctx, product.uuid, -1)), "ok");
        const stock = await stockOf(item.uuid);
        check("  currentStock", stock.currentStock, 4);
        check("  availableStock", stock.availableStock, 0);
    }

    {
        // 10 in stock, reorder point 5: five concurrent -2 deductions cross
        // the threshold together and must raise one alert between them
        const { product } = await stockedProduct(ctx, 10, { reorderPoint: 5 });
        let alerts = 0;
        eventBus.on("INVENTORY_LOW_STOCK", (payload) => {
            if (payload.productUuid === product.uuid) alerts++;
        });

        await Promise.all(Array.from({ length: 5 }, () => settle(adjust(ctx, product.uuid, -2))));
        check("low-stock alerts from 5 concurrent deductions", alerts, 1);
    }
}

// 6. InventoryService.releaseStock, as ExpiredReservationCleanupJob calls it
async function releaseStock(ctx: Ctx) {
    console.log("\n6. InventoryService.releaseStock");

    const { product, item } = await stockedProduct(ctx, 10);
    const order = await reservedOrder(ctx, product.uuid, 3);

    const results = await Promise.all(
        Array.from({ length: 3 }, () => settle(InventoryService.releaseStock({ orderUuid: order.uuid })))
    );
    console.log(`    results: ${tally(results)}`);

    const stock = await stockOf(item.uuid);
    const returns = await prisma.inventoryMovement.count({ where: { referenceUuid: order.uuid, type: "RETURN" } });
    check("availableStock", stock.availableStock, 10);
    check("reservedStock", stock.reservedStock, 0);
    check("RETURN movements", returns, 1);
}

// 7. The expiry job finds one unpaid and one paid order still reserved
async function expiryJob(ctx: Ctx) {
    console.log("\n7. ReservationExpiryJob");

    const unpaid = await stockedProduct(ctx, 10);
    const unpaidOrder = await reservedOrder(ctx, unpaid.product.uuid, 2);

    const paid = await stockedProduct(ctx, 10);
    const paidOrder = await reservedOrder(ctx, paid.product.uuid, 2);
    // Paid, but PAYMENT_CONFIRMED's commit never ran
    await prisma.order.update({ where: { uuid: paidOrder.uuid }, data: { status: "PAID" } });

    await prisma.inventoryReservation.updateMany({
        where: { orderUuid: { in: [unpaidOrder.uuid, paidOrder.uuid] } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await ReservationExpiryJob.run();

    const unpaidReservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderUuid: unpaidOrder.uuid } });
    const paidReservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderUuid: paidOrder.uuid } });
    check("unpaid order's reservation", unpaidReservation.status, "RELEASED");
    check("  availableStock back to", (await stockOf(unpaid.item.uuid)).availableStock, 10);
    check("paid order's reservation", paidReservation.status, "COMMITTED");
    const paidStock = await stockOf(paid.item.uuid);
    check("  currentStock sold", paidStock.currentStock, 8);
    check("  availableStock", paidStock.availableStock, 8);
}

let exitCode = 0;
try {
    const ctx = await setup();
    console.log(`Run ${ctx.runId} (store ${ctx.store.uuid})`);

    await commitVsRelease(ctx);
    await doubleCommit(ctx);
    await latePayment(ctx);
    await lowStockStatus(ctx);
    await adjustVsReservations(ctx);
    await releaseStock(ctx);
    await expiryJob(ctx);

    console.log(failures === 0 ? "\nAll inventory race checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nInventory race test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
