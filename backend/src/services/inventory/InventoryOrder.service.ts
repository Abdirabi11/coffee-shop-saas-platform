import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


type Tx = Prisma.TransactionClient;

// The status the stock on hand implies, as InventoryReconciliationJob computes it
const STATUS_FROM_STOCK = Prisma.sql`(CASE
    WHEN "currentStock" <= 0 THEN 'OUT_OF_STOCK'
    WHEN "reorderPoint" IS NOT NULL AND "currentStock" <= "reorderPoint" THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
END)::"InventoryStatus"`;

export class InventoryOrderService {
 
    static async reserveForOrder(input: {
        tenantUuid: string;
        storeUuid: string;
        orderUuid: string;
        items: Array<{ productUuid: string; quantity: number }>;
        tx?: Tx;
    }) {
        // Lock inventory rows in a fixed order (by product) so two orders for
        // the same products can't deadlock by locking them in opposite order
        const items = [...input.items].sort((a, b) => a.productUuid.localeCompare(b.productUuid));

        const execute = async (client: any) => {
            for (const item of items) {
                const inventory = await client.inventoryItem.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        productUuid: item.productUuid,
                    },
                });

                if (!inventory) {
                    const product = await client.product.findUnique({
                        where: { uuid: item.productUuid },
                        select: { trackInventory: true },
                    });
                    if (!product?.trackInventory) continue;  // ← skip, don't throw
                    throw new Error(`INVENTORY_NOT_FOUND: ${item.productUuid}`);
                }
        
                // Check and decrement in one statement: Postgres re-evaluates
                // availableStock >= quantity after taking the row lock, so
                // concurrent orders can't both take the last units. Reading
                // first and decrementing after (the old code) could oversell.
                let reserved;
                try {
                    reserved = await client.inventoryItem.update({
                        where: {
                            uuid: inventory.uuid,
                            availableStock: { gte: item.quantity },
                        },
                        data: {
                            reservedStock: { increment: item.quantity },
                            availableStock: { decrement: item.quantity },
                            reservedQuantity: { increment: item.quantity },
                            lastUpdated: new Date(),
                        },
                        select: { availableStock: true },
                    });
                } catch (error) {
                    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
                        throw new Error(`OUT_OF_STOCK: ${item.productUuid} — requested ${item.quantity}`);
                    }
                    throw error;
                }
                const previousAvailable = reserved.availableStock + item.quantity;
        
                // Create reservation record (old job didn't create this)
                await client.inventoryReservation.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        orderUuid: input.orderUuid,
                        quantity: item.quantity,
                        status: "ACTIVE",
                        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                    },
                });
        
                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "ADJUSTMENT",
                        quantity: -item.quantity,
                        previousStock: previousAvailable,
                        newStock: reserved.availableStock,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Stock reserved for order",
                    },
                });
        
                // Mark order item as reserved
                await client.orderItem.updateMany({
                    where: {
                        orderUuid: input.orderUuid,
                        productUuid: item.productUuid,
                    },
                    data: { inventoryReserved: true },
                });
            }
        };
    
        if (input.tx) {
            await execute(input.tx);
        } else {
            await prisma.$transaction(async (tx) => execute(tx));
        }
    
        logWithContext("info", "[InventoryOrder] Reserved", {
            orderUuid: input.orderUuid,
            items: input.items.length,
        });
    
        MetricsService.increment("inventory.reserved", input.items.length);
    }
 

    // Commit, release and direct sale for one order take this lock first, so
    // they run one at a time and whichever comes second sees what the first
    // left behind: a payment confirmation racing the reservation expiry job
    // can no longer both act on the same reservations.
    private static async lockOrder(client: any, orderUuid: string) {
        const [order] = await client.$queryRaw<Array<{
            uuid: string;
            tenantUuid: string;
            storeUuid: string;
            status: string;
            inventoryCommitted: boolean;
        }>>`
            SELECT "uuid", "tenantUuid", "storeUuid", "status"::text AS "status", "inventoryCommitted"
            FROM "Order"
            WHERE "uuid" = ${orderUuid}
            FOR UPDATE
        `;
        return order ?? null;
    }

    // Recompute the status from the row as it now stands (the caller already
    // holds its lock) and write it only when it changes, so an item that stays
    // below its reorder point keeps LOW_STOCK instead of being reset to
    // IN_STOCK. DISCONTINUED and BACKORDERED are set by hand and left alone.
    static async refreshStatus(client: any, inventoryItemUuid: string) {
        await client.$executeRaw`
            UPDATE "InventoryItem"
            SET "status" = ${STATUS_FROM_STOCK}
            WHERE "uuid" = ${inventoryItemUuid}
              AND "status" NOT IN ('DISCONTINUED', 'BACKORDERED')
              AND "status" <> ${STATUS_FROM_STOCK}
        `;
    }

    private static async recordSale(client: any, sale: {
        tenantUuid: string;
        storeUuid: string;
        inventoryItemUuid: string;
        productUuid: string;
        orderUuid: string;
        quantity: number;
        newStock: number;
        reason: string;
    }) {
        const previousStock = sale.newStock + sale.quantity;

        await client.inventoryMovement.create({
            data: {
                tenantUuid: sale.tenantUuid,
                storeUuid: sale.storeUuid,
                inventoryItemUuid: sale.inventoryItemUuid,
                productUuid: sale.productUuid,
                type: "SALE",
                quantity: -sale.quantity,
                previousStock,
                newStock: sale.newStock,
                referenceType: "ORDER",
                referenceUuid: sale.orderUuid,
                reason: sale.reason,
            },
        });

        await client.inventoryTransaction.create({
            data: {
                tenantUuid: sale.tenantUuid,
                storeUuid: sale.storeUuid,
                inventoryItemUuid: sale.inventoryItemUuid,
                productUuid: sale.productUuid,
                quantity: -sale.quantity,
                previousQuantity: previousStock,
                newQuantity: sale.newStock,
                reason: "ORDER_SALE",
                orderUuid: sale.orderUuid,
            },
        });
    }

    // Turns the order's reservations into a sale. Safe to repeat and to run
    // concurrently with releaseForOrder: each reservation is claimed with a
    // conditional update (ACTIVE → COMMITTED), and an order that is already
    // committed is left alone.
    //
    // A reservation can lapse before the payment lands (the expiry job, or a
    // failed attempt released it before a retry succeeded). That quantity is
    // taken again here, from available stock only so other orders'
    // reservations are untouched; if it is gone the commit fails with
    // OUT_OF_STOCK rather than recording a sale that never left stock.
    static async commitForOrder(input: { orderUuid: string; tx?: Tx }) {
        if (!input.orderUuid) throw new Error("ORDER_UUID_REQUIRED");

        const execute = async (client: any) => {
            const order = await this.lockOrder(client, input.orderUuid);
            if (!order) throw new Error(`ORDER_NOT_FOUND: ${input.orderUuid}`);

            if (order.inventoryCommitted) {
                logWithContext("info", "[InventoryOrder] Already committed", { orderUuid: input.orderUuid });
                return { committed: 0, retaken: 0 };
            }
            if (order.status === "CANCELLED") {
                logWithContext("warn", "[InventoryOrder] Not committing a cancelled order", { orderUuid: input.orderUuid });
                return { committed: 0, retaken: 0 };
            }

            const reservations = await client.inventoryReservation.findMany({
                where: { orderUuid: input.orderUuid, status: "ACTIVE" },
            });
            const ordered = await client.orderItem.groupBy({
                by: ["productUuid"],
                where: { orderUuid: input.orderUuid },
                _sum: { quantity: true },
            });

            // One pass per product, in the fixed order reserveForOrder locks
            // them, so concurrent commits can't deadlock
            const productUuids: string[] = [...new Set<string>([
                ...reservations.map((r: any) => r.productUuid),
                ...ordered.map((o: any) => o.productUuid),
            ])].sort((a, b) => a.localeCompare(b));

            let committed = 0;
            let retaken = 0;

            for (const productUuid of productUuids) {
                let covered = 0;

                for (const reservation of reservations.filter((r: any) => r.productUuid === productUuid)) {
                    const claim = await client.inventoryReservation.updateMany({
                        where: { uuid: reservation.uuid, status: "ACTIVE" },
                        data: { status: "COMMITTED", committedAt: new Date() },
                    });
                    if (claim.count === 0) continue; // committed or released meanwhile

                    const item = await client.inventoryItem.update({
                        where: { uuid: reservation.inventoryItemUuid },
                        data: {
                            currentStock: { decrement: reservation.quantity },
                            reservedStock: { decrement: reservation.quantity },
                            quantity: { decrement: reservation.quantity },
                            reservedQuantity: { decrement: reservation.quantity },
                            lastUpdated: new Date(),
                        },
                        select: { currentStock: true },
                    });
                    await this.refreshStatus(client, reservation.inventoryItemUuid);
                    await this.recordSale(client, {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid,
                        orderUuid: input.orderUuid,
                        quantity: reservation.quantity,
                        newStock: item.currentStock,
                        reason: "Order paid — stock committed",
                    });

                    covered += reservation.quantity;
                    committed++;
                }

                const orderedQuantity = ordered.find((o: any) => o.productUuid === productUuid)?._sum.quantity ?? 0;
                const missing = orderedQuantity - covered;
                if (missing <= 0) continue;

                const inventory = await client.inventoryItem.findFirst({
                    where: { tenantUuid: order.tenantUuid, storeUuid: order.storeUuid, productUuid },
                    select: { uuid: true },
                });
                if (!inventory) {
                    const product = await client.product.findUnique({
                        where: { uuid: productUuid },
                        select: { trackInventory: true },
                    });
                    if (!product?.trackInventory) continue; // untracked: there is no stock to take
                    throw new Error(`INVENTORY_NOT_FOUND: ${productUuid}`);
                }

                // Same check-and-decrement as reserveForOrder: Postgres
                // re-evaluates availableStock >= missing under the row lock
                let item;
                try {
                    item = await client.inventoryItem.update({
                        where: { uuid: inventory.uuid, availableStock: { gte: missing } },
                        data: {
                            currentStock: { decrement: missing },
                            availableStock: { decrement: missing },
                            quantity: { decrement: missing },
                            lastUpdated: new Date(),
                        },
                        select: { currentStock: true },
                    });
                } catch (error) {
                    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
                        throw new Error(`OUT_OF_STOCK: ${productUuid} — reservation lapsed and ${missing} no longer available`);
                    }
                    throw error;
                }
                await this.refreshStatus(client, inventory.uuid);
                await this.recordSale(client, {
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    inventoryItemUuid: inventory.uuid,
                    productUuid,
                    orderUuid: input.orderUuid,
                    quantity: missing,
                    newStock: item.currentStock,
                    reason: "Order paid after its reservation lapsed — stock taken at payment",
                });

                retaken++;
            }

            await client.order.update({
                where: { uuid: input.orderUuid },
                data: { inventoryCommitted: true },
            });

            return { committed, retaken };
        };

        const result = input.tx
            ? await execute(input.tx)
            : await prisma.$transaction(async (tx) => execute(tx));

        logWithContext("info", "[InventoryOrder] Committed", {
            orderUuid: input.orderUuid,
            ...result,
        });

        MetricsService.increment("inventory.committed", 1);
        if (result.retaken > 0) MetricsService.increment("inventory.commit.retaken", result.retaken);

        return result;
    }

    // Gives the order's ACTIVE reservations back to available stock. Safe to
    // repeat and to run concurrently with commitForOrder: each reservation is
    // claimed with a conditional update (ACTIVE → RELEASED), so one that was
    // committed or released meanwhile is skipped.
    static async releaseForOrder(input: { orderUuid: string; tx?: Tx }) {
        if (!input.orderUuid) throw new Error("ORDER_UUID_REQUIRED");

        const execute = async (client: any) => {
            await this.lockOrder(client, input.orderUuid);

            const reservations = await client.inventoryReservation.findMany({
                where: { orderUuid: input.orderUuid, status: "ACTIVE" },
                orderBy: { productUuid: "asc" },
            });

            let released = 0;

            for (const reservation of reservations) {
                const claim = await client.inventoryReservation.updateMany({
                    where: { uuid: reservation.uuid, status: "ACTIVE" },
                    data: { status: "RELEASED", releasedAt: new Date() },
                });
                if (claim.count === 0) continue;

                // currentStock is unchanged, so the status is too
                const item = await client.inventoryItem.update({
                    where: { uuid: reservation.inventoryItemUuid },
                    data: {
                        reservedStock: { decrement: reservation.quantity },
                        availableStock: { increment: reservation.quantity },
                        reservedQuantity: { decrement: reservation.quantity },
                        lastUpdated: new Date(),
                    },
                    select: { availableStock: true },
                });

                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        type: "RETURN",
                        quantity: reservation.quantity,
                        previousStock: item.availableStock - reservation.quantity,
                        newStock: item.availableStock,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Reservation released — order cancelled/expired",
                    },
                });

                await client.orderItem.updateMany({
                    where: {
                        orderUuid: input.orderUuid,
                        productUuid: reservation.productUuid,
                        inventoryReleased: false,
                    },
                    data: { inventoryReleased: true },
                });

                released++;
            }

            if (released > 0) {
                await client.order.update({
                    where: { uuid: input.orderUuid },
                    data: { inventoryReleased: true },
                });
            }

            return released;
        };

        const released = input.tx
            ? await execute(input.tx)
            : await prisma.$transaction(async (tx) => execute(tx));

        if (released === 0) {
            logWithContext("info", "[InventoryOrder] No active reservations to release", {
                orderUuid: input.orderUuid,
            });
            return 0;
        }

        logWithContext("info", "[InventoryOrder] Released", {
            orderUuid: input.orderUuid,
            released,
        });

        MetricsService.increment("inventory.released", 1);
        return released;
    }

    // Gives back part of an order's reservation for one product: an item
    // removed, or its quantity lowered, before payment. Takes it from the
    // order's ACTIVE reservations for that product, shrinking one when only
    // part of it is returned. A reservation that already lapsed has nothing
    // to give back; commitForOrder takes stock for the order's items as they
    // stand at payment, so the two stay consistent either way.
    static async releaseQuantity(input: {
        orderUuid: string;
        productUuid: string;
        quantity: number;
        reason: string;
        tx?: Tx;
    }) {
        if (!input.orderUuid) throw new Error("ORDER_UUID_REQUIRED");

        const execute = async (client: any) => {
            await this.lockOrder(client, input.orderUuid);

            const reservations = await client.inventoryReservation.findMany({
                where: { orderUuid: input.orderUuid, productUuid: input.productUuid, status: "ACTIVE" },
                orderBy: { createdAt: "desc" },
            });

            let remaining = input.quantity;
            let released = 0;

            for (const reservation of reservations) {
                if (remaining <= 0) break;
                const take = Math.min(reservation.quantity, remaining);

                // Conditional on the reservation being exactly as read
                const claim = take === reservation.quantity
                    ? await client.inventoryReservation.updateMany({
                        where: { uuid: reservation.uuid, status: "ACTIVE" },
                        data: { status: "RELEASED", releasedAt: new Date() },
                    })
                    : await client.inventoryReservation.updateMany({
                        where: { uuid: reservation.uuid, status: "ACTIVE", quantity: reservation.quantity },
                        data: { quantity: { decrement: take } },
                    });
                if (claim.count === 0) continue;

                const item = await client.inventoryItem.update({
                    where: { uuid: reservation.inventoryItemUuid },
                    data: {
                        reservedStock: { decrement: take },
                        availableStock: { increment: take },
                        reservedQuantity: { decrement: take },
                        lastUpdated: new Date(),
                    },
                    select: { availableStock: true },
                });

                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        type: "RETURN",
                        quantity: take,
                        previousStock: item.availableStock - take,
                        newStock: item.availableStock,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: input.reason,
                    },
                });

                remaining -= take;
                released += take;
            }

            return released;
        };

        return input.tx
            ? execute(input.tx)
            : prisma.$transaction(async (tx) => execute(tx));
    }

    static async deductForOrder(input: {
        orderUuid: string;
        tenantUuid: string;
        storeUuid: string;
        items: Array<{ productUuid: string; quantity: number }>;
        tx?: Tx;
    }) {
        // Fixed lock order, same as reserveForOrder
        const items = [...input.items].sort((a, b) => a.productUuid.localeCompare(b.productUuid));

        const execute = async (client: any) => {
            // A repeated cashier payment event must not sell the stock twice
            const order = await this.lockOrder(client, input.orderUuid);
            if (order?.inventoryCommitted) {
                logWithContext("info", "[InventoryOrder] Already committed", { orderUuid: input.orderUuid });
                return;
            }

            for (const item of items) {
                const inventory = await client.inventoryItem.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        productUuid: item.productUuid,
                    },
                    select: { uuid: true },
                });

                if (!inventory) continue;

                // The sale has already happened, so this never rejects: it
                // decrements (clamped at 0) in one statement. The subquery
                // locks the row first, so the stock it computes from is the
                // latest committed value and concurrent sales each count; the
                // old read-then-write-absolute-value could lose one.
                const [row] = await client.$queryRaw<Array<{ previousStock: number; newStock: number }>>`
                    UPDATE "InventoryItem" AS i
                    SET "currentStock"   = GREATEST(0, old."currentStock" - ${item.quantity}),
                        "availableStock" = GREATEST(0, GREATEST(0, old."currentStock" - ${item.quantity}) - old."reservedStock"),
                        "quantity"       = GREATEST(0, old."currentStock" - ${item.quantity}),
                        "lastUpdated"    = NOW()
                    FROM (
                        SELECT "uuid", "currentStock", "reservedStock"
                        FROM "InventoryItem"
                        WHERE "uuid" = ${inventory.uuid}
                        FOR UPDATE
                    ) AS old
                    WHERE i."uuid" = old."uuid"
                    RETURNING old."currentStock" AS "previousStock", i."currentStock" AS "newStock"
                `;
                const { previousStock, newStock } = row;
                await this.refreshStatus(client, inventory.uuid);

                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "SALE",
                        quantity: -item.quantity,
                        previousStock,
                        newStock,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Direct sale (cashier)",
                    },
                });

                await client.inventoryTransaction.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        quantity: -item.quantity,
                        previousQuantity: previousStock,
                        newQuantity: newStock,
                        reason: "ORDER_SALE",
                        orderUuid: input.orderUuid,
                    },
                });
            }

            // Mark order committed
            await client.order.update({
                where: { uuid: input.orderUuid },
                data: { inventoryCommitted: true },
            });
        };

        if (input.tx) {
            await execute(input.tx);
        } else {
            await prisma.$transaction(async (tx) => execute(tx));
        }
    }
}
