import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


type Tx = Prisma.TransactionClient;
  
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
 
    static async commitForOrder(input: { orderUuid: string; tx?: Tx }) {
        const execute = async (client: any) => {
            const reservations = await client.inventoryReservation.findMany({
                where: {
                    orderUuid: input.orderUuid,
                    status: "ACTIVE",
                },
                include: {
                    inventoryItem: {
                        select: { uuid: true, currentStock: true, storeUuid: true },
                    },
                },
            });
    
            if (reservations.length === 0) {
                logWithContext("warn", "[InventoryOrder] No active reservations to commit", {
                    orderUuid: input.orderUuid,
                });
                return;
            };
    
            for (const reservation of reservations) {
                const prevStock = reservation.inventoryItem.currentStock;
                const newStock = prevStock - reservation.quantity;
        
                // Mark reservation as committed
                await client.inventoryReservation.update({
                    where: { uuid: reservation.uuid },
                    data: { status: "COMMITTED", committedAt: new Date() },
                });

                await client.inventoryItem.update({
                    where: { uuid: reservation.inventoryItemUuid },
                    data: {
                        // New fields (reservedStock AND currentStock both decrease)
                        currentStock: { decrement: reservation.quantity },
                        reservedStock: { decrement: reservation.quantity },
                        quantity: { decrement: reservation.quantity },
                        reservedQuantity: { decrement: reservation.quantity },
                        status: newStock <= 0 ? "OUT_OF_STOCK" : "IN_STOCK",
                        lastUpdated: new Date(),
                    },
                });
        
                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        type: "SALE",
                        quantity: -reservation.quantity,
                        previousStock: prevStock,
                        newStock: Math.max(0, newStock),
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Order paid — stock committed",
                    },
                });
        
                await client.inventoryTransaction.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        quantity: -reservation.quantity,
                        previousQuantity: prevStock,  // FIX: was `previousStock`
                        newQuantity: Math.max(0, newStock), // FIX: was `newStock`
                        reason: "ORDER_SALE",
                        orderUuid: input.orderUuid,
                    },
                });
            }
        
            // Mark order as committed
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
    
        logWithContext("info", "[InventoryOrder] Committed", {
            orderUuid: input.orderUuid,
        });
    
        MetricsService.increment("inventory.committed", 1);
    }
 
    static async releaseForOrder(input: { orderUuid: string; tx?: Tx }) {
        const execute = async (client: any) => {
            const reservations = await client.inventoryReservation.findMany({
                where: {
                    orderUuid: input.orderUuid,
                    status: "ACTIVE",
                },
                include: {
                    inventoryItem: {
                        select: { uuid: true, availableStock: true, storeUuid: true },
                    },
                },
            });
    
            if (reservations.length === 0) {
                logWithContext("info", "[InventoryOrder] No active reservations to release", {
                    orderUuid: input.orderUuid,
                });
                return;
            };
    
            for (const reservation of reservations) {
                const prevAvailable = reservation.inventoryItem.availableStock;
                const newAvailable = prevAvailable + reservation.quantity;
        
                // Mark reservation as released
                await client.inventoryReservation.update({
                    where: { uuid: reservation.uuid },
                    data: { status: "RELEASED", releasedAt: new Date() },
                });
        
                await client.inventoryItem.update({
                    where: { uuid: reservation.inventoryItemUuid },
                    data: {
                        reservedStock: { decrement: reservation.quantity },
                        availableStock: { increment: reservation.quantity },
                        reservedQuantity: { decrement: reservation.quantity },
                        status: newAvailable > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
                        lastUpdated: new Date(),
                    },
                });
        
                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        type: "RETURN",
                        quantity: reservation.quantity,
                        previousStock: prevAvailable,
                        newStock: newAvailable,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Reservation released — order cancelled/expired",
                    },
                });
        
                // Mark order items as released
                await client.orderItem.updateMany({
                    where: {
                        orderUuid: input.orderUuid,
                        productUuid: reservation.productUuid,
                        inventoryReleased: false,
                    },
                    data: { inventoryReleased: true },
                });
            }
    
            // Mark order as released
            await client.order.update({
                where: { uuid: input.orderUuid },
                data: { inventoryReleased: true },
            });
        };
    
        if (input.tx) {
            await execute(input.tx);
        } else {
            await prisma.$transaction(async (tx) => execute(tx));
        }
    
        logWithContext("info", "[InventoryOrder] Released", {
            orderUuid: input.orderUuid,
        });
    
        MetricsService.increment("inventory.released", 1);
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
                        "status"         = (CASE WHEN old."currentStock" - ${item.quantity} <= 0
                                                 THEN 'OUT_OF_STOCK' ELSE 'IN_STOCK' END)::"InventoryStatus",
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