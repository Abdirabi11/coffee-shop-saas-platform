// LOCAL ORDER MODIFICATION CHECKS
// Calls OrderModificationService directly against the local database (orders
// are created through OrderCommandService.createOrder) and checks the order,
// its items, reservations and stock:
//
//   1. addItem - prices the item from the order's own store menu, reserves
//      its stock, and re-totals with the store's tax rate and service charge
//      (5% / 10% here, so the old hardcoded 10% tax shows up as a mismatch).
//      Bad quantities, unknown products, sold-out products and another
//      tenant's order are rejected with nothing changed.
//   2. removeItem - the item's reservation is released before the item goes,
//      so the payment afterwards sells only what is still ordered.
//   3. updateItemQuantity - raising reserves the difference, lowering
//      releases it (shrinking the reservation).
//   4. Locked once payment starts - an order with a Payment row, or one that
//      is paid or cancelled, is refused.
//   5. Concurrency - many adds and removes on one order at once leave the
//      totals matching the items and the reservations matching the
//      quantities.
//
//   npx tsx scripts/test-order-modification.ts
//
// Reuses the seed-test-payment tenant; each run creates its own store and
// products. Exits non-zero if any check fails. Local databases only.
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// Unreachable Upstash makes every menu load wait out its retries
const fakeUpstash = await useFakeUpstashIfUnreachable();

process.env.LOG_LEVEL ??= "fatal";
(globalThis as any).prisma ??= new PrismaClient({ log: [] });

const { default: prisma } = await import("../src/config/prisma.ts");
const { OrderCommandService } = await import("../src/services/order/OrderCommand.service.ts");
const { OrderModificationService } = await import("../src/services/order/OrderModification.service.ts");
const { InventoryOrderService } = await import("../src/services/inventory/InventoryOrder.service.ts");
const { bumpCacheVersion } = await import("../src/infrastructure/cache/cacheVersion.ts");

const TEST_PHONE = "+10000000001";
const TEST_TENANT_SLUG = "sim-test-tenant";
const TAX_RATE = 5;            // percent
const SERVICE_CHARGE_RATE = 10; // percent

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
            name: `Modification Store ${runId}`,
            slug: `modification-${runId}`,
            city: "Mogadishu",
            taxRate: TAX_RATE,
            serviceChargeRate: SERVICE_CHARGE_RATE,
        },
    });

    // Orders and added items are refused outside opening hours: open 24/7
    await prisma.storeOpeningHour.createMany({
        data: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((day) => ({
            tenantUuid: tenant.uuid,
            storeUuid: store.uuid,
            dayOfWeek: day as any,
            periods: [],
            is24Hours: true,
        })),
    });

    const category = await prisma.category.create({
        data: { tenantUuid: tenant.uuid, storeUuid: store.uuid, name: "Modification Test", slug: "modification-test" },
    });

    return { tenant, tenantUser, store, category, runId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function stockedProduct(ctx: Ctx, name: string, price: number, stock: number) {
    const product = await prisma.product.create({
        data: {
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            categoryUuid: ctx.category.uuid,
            name,
            basePrice: price,
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
        },
    });

    // Inserted directly, so invalidate the cached menu as the admin flow does
    await bumpCacheVersion(`menu:${ctx.store.uuid}`).catch(() => {});

    return { product, item };
}

function newOrder(ctx: Ctx, items: Array<{ productUuid: string; quantity: number }>) {
    return OrderCommandService.createOrder({
        tenantUuid: ctx.tenant.uuid,
        storeUuid: ctx.store.uuid,
        tenantUserUuid: ctx.tenantUser.uuid,
        orderType: "TAKEAWAY",
        items,
    });
}

const stockOf = (uuid: string) =>
    prisma.inventoryItem.findUniqueOrThrow({
        where: { uuid },
        select: { currentStock: true, reservedStock: true, availableStock: true },
    });

// What the order's totals should be from its items as they stand, priced the
// way the store is configured
async function expectedTotals(orderUuid: string) {
    const items = await prisma.orderItem.findMany({ where: { orderUuid } });
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const tax = Math.round(subtotal * (TAX_RATE / 100));
    const service = Math.round(subtotal * (SERVICE_CHARGE_RATE / 100));
    return { subtotal, tax, service, total: subtotal + tax + service, items };
}

async function checkTotals(label: string, orderUuid: string) {
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    const expected = await expectedTotals(orderUuid);
    check(`${label} subtotal`, order.subtotal, expected.subtotal);
    check(`${label} tax (${TAX_RATE}%)`, order.taxAmount, expected.tax);
    check(`${label} service charge (${SERVICE_CHARGE_RATE}%)`, order.serviceCharge, expected.service);
    check(`${label} total`, order.totalAmount, expected.total);
    check(`${label} item tax shares sum to the tax`, expected.items.reduce((s, i) => s + i.taxAmount, 0), order.taxAmount);
}

async function addItem(ctx: Ctx) {
    console.log("\n1. addItem");

    const latte = await stockedProduct(ctx, `Latte ${ctx.runId}`, 350, 10);
    const muffin = await stockedProduct(ctx, `Muffin ${ctx.runId}`, 500, 10);
    const order = await newOrder(ctx, [{ productUuid: latte.product.uuid, quantity: 1 }]);

    const updated = await OrderModificationService.addItem({
        tenantUuid: ctx.tenant.uuid,
        orderUuid: order.uuid,
        productUuid: muffin.product.uuid,
        quantity: 2,
    });
    check("items on the order", updated.items.length, 2);
    check("muffin reservedStock", (await stockOf(muffin.item.uuid)).reservedStock, 2);
    check("muffin availableStock", (await stockOf(muffin.item.uuid)).availableStock, 8);
    await checkTotals("after add:", order.uuid);

    const before = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid } });
    const add = (productUuid: string, quantity: number, tenantUuid = ctx.tenant.uuid) =>
        settle(OrderModificationService.addItem({ tenantUuid, orderUuid: order.uuid, productUuid, quantity }));

    check("negative quantity", await add(latte.product.uuid, -5), "INVALID_QUANTITY");
    check("fractional quantity", await add(latte.product.uuid, 1.5), "INVALID_QUANTITY");
    check("unknown product", await add(crypto.randomUUID(), 1), "ORDER_VALIDATION_FAILED");
    check("more than in stock", await add(muffin.product.uuid, 9), "OUT_OF_STOCK");
    // Lookups are scoped to the caller's tenant, so another tenant's order is not found
    check("another tenant's order", await add(latte.product.uuid, 1, crypto.randomUUID()), "ORDER_NOT_FOUND");

    const after = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid }, include: { items: true } });
    check("  rejected adds left the item count", after.items.length, 2);
    check("  rejected adds left the total", after.totalAmount, before.totalAmount);
    check("  rejected adds left muffin reserved", (await stockOf(muffin.item.uuid)).reservedStock, 2);
    check("  rejected adds left latte reserved", (await stockOf(latte.item.uuid)).reservedStock, 1);
}

async function removeItem(ctx: Ctx) {
    console.log("\n2. removeItem, then payment");

    const latte = await stockedProduct(ctx, `Latte R ${ctx.runId}`, 350, 10);
    const muffin = await stockedProduct(ctx, `Muffin R ${ctx.runId}`, 500, 10);
    const order = await newOrder(ctx, [
        { productUuid: latte.product.uuid, quantity: 1 },
        { productUuid: muffin.product.uuid, quantity: 3 },
    ]);
    const muffinLine = (await prisma.orderItem.findFirstOrThrow({
        where: { orderUuid: order.uuid, productUuid: muffin.product.uuid },
    }));

    await OrderModificationService.removeItem({
        tenantUuid: ctx.tenant.uuid,
        orderUuid: order.uuid,
        orderItemUuid: muffinLine.uuid,
    });

    const muffinStock = await stockOf(muffin.item.uuid);
    check("muffin reservedStock after removal", muffinStock.reservedStock, 0);
    check("muffin availableStock after removal", muffinStock.availableStock, 10);
    check("latte still reserved", (await stockOf(latte.item.uuid)).reservedStock, 1);
    await checkTotals("after remove:", order.uuid);

    const latteLine = await prisma.orderItem.findFirstOrThrow({ where: { orderUuid: order.uuid } });
    check(
        "removing the last item",
        await settle(OrderModificationService.removeItem({
            tenantUuid: ctx.tenant.uuid,
            orderUuid: order.uuid,
            orderItemUuid: latteLine.uuid,
        })),
        "CANNOT_REMOVE_LAST_ITEM"
    );

    // The payment lands: only the latte is sold
    await InventoryOrderService.commitForOrder({ orderUuid: order.uuid });
    check("after payment: muffin currentStock untouched", (await stockOf(muffin.item.uuid)).currentStock, 10);
    check("after payment: latte currentStock sold", (await stockOf(latte.item.uuid)).currentStock, 9);
}

async function updateQuantity(ctx: Ctx) {
    console.log("\n3. updateItemQuantity");

    const latte = await stockedProduct(ctx, `Latte Q ${ctx.runId}`, 350, 10);
    const order = await newOrder(ctx, [{ productUuid: latte.product.uuid, quantity: 1 }]);
    const line = await prisma.orderItem.findFirstOrThrow({ where: { orderUuid: order.uuid } });
    const update = (newQuantity: number) => OrderModificationService.updateItemQuantity({
        tenantUuid: ctx.tenant.uuid,
        orderUuid: order.uuid,
        orderItemUuid: line.uuid,
        newQuantity,
    });

    await update(4);
    check("1 → 4: reservedStock", (await stockOf(latte.item.uuid)).reservedStock, 4);
    await checkTotals("at 4:", order.uuid);

    await update(2);
    const stock = await stockOf(latte.item.uuid);
    check("4 → 2: reservedStock", stock.reservedStock, 2);
    check("4 → 2: availableStock", stock.availableStock, 8);
    const active = await prisma.inventoryReservation.aggregate({
        where: { orderUuid: order.uuid, status: "ACTIVE" },
        _sum: { quantity: true },
    });
    check("4 → 2: active reservation quantity", active._sum.quantity, 2);
    await checkTotals("at 2:", order.uuid);

    check("→ 11 (only 10 in stock)", await settle(update(11)), "OUT_OF_STOCK");
    check("→ 0", await settle(update(0)), "INVALID_QUANTITY");
    check("  rejected updates left reservedStock", (await stockOf(latte.item.uuid)).reservedStock, 2);
}

async function lockedOnceLocked(ctx: Ctx) {
    console.log("\n4. Refused once payment has started");

    const latte = await stockedProduct(ctx, `Latte P ${ctx.runId}`, 350, 20);
    const add = (orderUuid: string) => settle(OrderModificationService.addItem({
        tenantUuid: ctx.tenant.uuid,
        orderUuid,
        productUuid: latte.product.uuid,
        quantity: 1,
    }));

    // Payment row created (startPayment's placeholder), amount now fixed
    const started = await newOrder(ctx, [{ productUuid: latte.product.uuid, quantity: 1 }]);
    await prisma.payment.create({
        data: {
            orderUuid: started.uuid,
            tenantUuid: ctx.tenant.uuid,
            storeUuid: ctx.store.uuid,
            amount: started.totalAmount,
            currency: started.currency,
            subtotal: started.subtotal,
            tax: started.taxAmount,
            discount: started.discountAmount,
            paymentFlow: "PROVIDER",
            paymentMethod: "STRIPE",
            provider: "STRIPE",
            status: "PENDING",
            snapshot: {},
            orderSnapshot: {},
            pricingRules: {},
        },
    });
    check("order with a pending Payment", await add(started.uuid), "CANNOT_MODIFY_PAID_ORDER");

    const paid = await newOrder(ctx, [{ productUuid: latte.product.uuid, quantity: 1 }]);
    await prisma.order.update({ where: { uuid: paid.uuid }, data: { status: "PAID", paymentStatus: "PAID" } });
    check("paid order", await add(paid.uuid), "CANNOT_MODIFY_PAID_ORDER");

    const cancelled = await newOrder(ctx, [{ productUuid: latte.product.uuid, quantity: 1 }]);
    await prisma.order.update({ where: { uuid: cancelled.uuid }, data: { status: "CANCELLED" } });
    check("cancelled order", await add(cancelled.uuid), "ORDER_NOT_MODIFIABLE");
}

async function concurrent(ctx: Ctx) {
    console.log("\n5. 10 adds and 5 removes on one order at once");

    const latte = await stockedProduct(ctx, `Latte C ${ctx.runId}`, 350, 100);
    const muffin = await stockedProduct(ctx, `Muffin C ${ctx.runId}`, 500, 100);
    const order = await newOrder(ctx, [
        { productUuid: latte.product.uuid, quantity: 1 },
        ...Array.from({ length: 5 }, () => ({ productUuid: muffin.product.uuid, quantity: 2 })),
    ]);
    const muffinLines = await prisma.orderItem.findMany({
        where: { orderUuid: order.uuid, productUuid: muffin.product.uuid },
    });

    const results = await Promise.all([
        ...Array.from({ length: 10 }, (_, i) => settle(OrderModificationService.addItem({
            tenantUuid: ctx.tenant.uuid,
            orderUuid: order.uuid,
            productUuid: i % 2 ? latte.product.uuid : muffin.product.uuid,
            quantity: 1 + (i % 3),
        }))),
        ...muffinLines.map((line) => settle(OrderModificationService.removeItem({
            tenantUuid: ctx.tenant.uuid,
            orderUuid: order.uuid,
            orderItemUuid: line.uuid,
        }))),
    ]);
    console.log(`    results: ${tally(results)}`);
    check("all changes applied", results.filter((r) => r === "ok").length, 15);

    await checkTotals("after concurrent changes:", order.uuid);

    const items = await prisma.orderItem.findMany({ where: { orderUuid: order.uuid } });
    for (const [name, p] of [["latte", latte], ["muffin", muffin]] as const) {
        const ordered = items.filter((i) => i.productUuid === p.product.uuid).reduce((s, i) => s + i.quantity, 0);
        const stock = await stockOf(p.item.uuid);
        check(`${name} reservedStock matches ordered quantity`, stock.reservedStock, ordered);
        check(`${name} availableStock`, stock.availableStock, 100 - ordered);
    }
}

let exitCode = 0;
try {
    const ctx = await setup();
    console.log(`Run ${ctx.runId} (store ${ctx.store.uuid})`);
    if (fakeUpstash) console.log("  Upstash unreachable - menu cache served by an in-memory stand-in");

    await addItem(ctx);
    await removeItem(ctx);
    await updateQuantity(ctx);
    await lockedOnceLocked(ctx);
    await concurrent(ctx);

    console.log(failures === 0 ? "\nAll order modification checks passed" : `\n${failures} check(s) FAILED`);
    exitCode = failures === 0 ? 0 : 1;
} catch (error) {
    console.error("\nOrder modification test crashed:", error);
    exitCode = 1;
} finally {
    await prisma.$disconnect();
    fakeUpstash?.close();
}
process.exit(exitCode);
