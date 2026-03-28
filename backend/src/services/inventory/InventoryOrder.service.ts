import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";


type Tx = Prisma.TransactionClient;
  
export class InventoryOrderService {
 
    static async reserveForOrder(input: {
        tenantUuid: string;
        storeUuid: string;
        orderUuid: string;
        items: Array<{ productUuid: string; quantity: number }>;
        tx?: Tx;
    }) {
        const execute = async (client: any) => {
            for (const item of input.items) {
                const inventory = await client.inventoryItem.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        productUuid: item.productUuid,
                    },
                });
        
                if (!inventory) {
                    throw new Error(`INVENTORY_NOT_FOUND: ${item.productUuid}`);
                }
        
                if (inventory.availableStock < item.quantity) {
                    const product = await client.product.findUnique({
                        where: { uuid: item.productUuid },
                        select: { name: true },
                    });
                    throw new Error(
                        `INSUFFICIENT_STOCK: ${product?.name ?? item.productUuid} — available: ${inventory.availableStock}, requested: ${item.quantity}`
                    );
                }
        
                await client.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        reservedStock: { increment: item.quantity },
                        availableStock: { decrement: item.quantity },
                        reservedQuantity: { increment: item.quantity },
                        lastUpdated: new Date(),
                    },
                });
        
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
                        previousStock: inventory.availableStock,
                        newStock: inventory.availableStock - item.quantity,
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
        const execute = async (client: any) => {
            for (const item of input.items) {
                const inventory = await client.inventoryItem.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        productUuid: item.productUuid,
                    },
                });
        
                if (!inventory) continue;
        
                const newStock = Math.max(0, inventory.currentStock - item.quantity);
        
                await client.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        currentStock: newStock,
                        availableStock: Math.max(0, newStock - inventory.reservedStock),
                        quantity: newStock,
                        status: newStock <= 0 ? "OUT_OF_STOCK" : "IN_STOCK",
                        lastUpdated: new Date(),
                    },
                });
        
                await client.inventoryMovement.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "SALE",
                        quantity: -item.quantity,
                        previousStock: inventory.currentStock,
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
                        previousQuantity: inventory.currentStock,
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