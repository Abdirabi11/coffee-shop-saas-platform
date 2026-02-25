import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.js";
import { MetricsService } from "../../infrastructure/observability/metricsService.js";

export class InventoryService{
    static async adjustStock(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        quantity: number; // Positive = increase, Negative = decrease
        reason: string;
        adjustedBy: string;
    }){
        const inventory= await prisma.inventoryItem.findUnique({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
        });

        if(!inventory){
            throw new Error("INVENTORY_NOT_FOUND");
        };

        const newQuantity = inventory.quantity + input.quantity;

        if (newQuantity < 0) {
          throw new Error("INSUFFICIENT_STOCK");
        };

        const updated= await prisma.inventoryItem.update({
            where: { uuid: inventory.uuid},
            data: {
                quantity: newQuantity,
                lastUpdated: new Date(),
            },
        });

        // Create inventory transaction log
        await prisma.inventoryTransaction.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                inventoryItemUuid: inventory.uuid,
                productUuid: input.productUuid,
                type: input.quantity > 0 ? "RESTOCK" : "ADJUSTMENT",
                quantity: input.quantity,
                previousStock: inventory.quantity,
                newStock: newQuantity,
                referenceType: "MANUAL",
                reason: input.reason,
                performedBy: input.adjustedBy,
            },
        });

        const product= await prisma.product.findUnique({
            where: {uuid: input.productUuid}
        });

        if (product?.lowStockThreshold && newQuantity <= product.lowStockThreshold) {
            EventBus.emit("INVENTORY_LOW_STOCK", {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                productName: product.name,
                currentStock: newQuantity,
                threshold: product.lowStockThreshold,
            });
        };

        logWithContext("info", "[Inventory] Stock adjusted", {
            productUuid: input.productUuid,
            adjustment: input.quantity,
            newQuantity,
            reason: input.reason,
        });
      
        MetricsService.increment("inventory.adjusted", 1, {
            type: input.quantity > 0 ? "increase" : "decrease",
        });
      
        return updated;
    }

    //Check if product has sufficient stock  
    static async checkStock(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        requestedQuantity: number;
   }): Promise<boolean> {
        const inventory = await prisma.inventoryItem.findFirst({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
        });
    
        if (!inventory) return false;

        const available = inventory.quantity - (inventory.reservedQuantity || 0);

        return available >= input.requestedQuantity;
    }

    //Reserve stock for pending order (prevents overselling)
    static async reserveStock(input: {
        tenantUuid: string;
        storeUuid: string;
        orderUuid: string;
        items: Array<{
            productUuid: string;
            quantity: number;
        }>;
        tx?: PrismaTransaction;
    }){
        const execute = async (prismaClient: any) => {
            for (const item of input.items) {
                // Get current inventory
                const inventory = await prismaClient.inventoryItem.findFirst({
                    where: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        productUuid: item.productUuid,
                    },
                });
      
                if (!inventory) {
                    throw new Error(`INVENTORY_NOT_FOUND: ${item.productUuid}`);
                };
    
                // Calculate available stock
                const available = inventory.quantity - (inventory.reservedQuantity || 0);
    
                if (available < item.quantity) {
                    // Get product name for better error message
                    const product = await prismaClient.product.findUnique({
                        where: { uuid: item.productUuid },
                        select: { name: true },
                    });
        
                    throw new Error(
                        `INSUFFICIENT_STOCK: ${product?.name || "Product"} - Available: ${available}, Requested: ${item.quantity}`
                    );
                };

                // Create reservation record
                await prismaClient.inventoryReservation.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        orderUuid: input.orderUuid,
                        quantity: item.quantity,
                        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
                        status: "ACTIVE",
                    },
                });
  
                // Increment reserved quantity
                await prismaClient.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        reservedQuantity: { increment: item.quantity },
                        lastUpdated: new Date(),
                    },
                });
        
                // Create inventory movement log
                await prismaClient.inventoryMovement.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        inventoryItemUuid: inventory.uuid,
                        productUuid: item.productUuid,
                        type: "RESERVATION",
                        quantity: item.quantity,
                        previousStock: inventory.quantity,
                        newStock: inventory.quantity, // Quantity doesn't change, only reserved
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Stock reserved for order",
                    },
                });
  
                logWithContext("info", "[Inventory] Stock reserved", {
                    productUuid: item.productUuid,
                    quantity: item.quantity,
                    orderUuid: input.orderUuid,
                });
            };  
        };

        // Execute with or without transaction
        if (input.tx) {
            await execute(input.tx);
        } else {
            await prisma.$transaction(async (tx) => {
                await execute(tx);
            });
        }
  
        MetricsService.increment("inventory.reserved", 1, {
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
        });
    }

    //Release reserved stock (order cancelled/expired)
    //Called when: Order cancelled, Order payment timeout
    static async releaseStock(input: {
        orderUuid: string;
        tx?: PrismaTransaction;
    }) {
        const execute = async (prismaClient: any) => {
            const reservations = await prismaClient.inventoryReservation.findMany({
                where: {
                    orderUuid: input.orderUuid,
                    status: "ACTIVE",
                },
            });
        
            if (reservations.length === 0) {
                    logWithContext("warn", "[Inventory] No active reservations to release", {
                    orderUuid: input.orderUuid,
                });
                return;
            }
    
            for (const reservation of reservations) {
                // Mark reservation as released
                await prismaClient.inventoryReservation.update({
                    where: { uuid: reservation.uuid },
                    data: {
                        status: "RELEASED",
                        releasedAt: new Date(),
                    },
                });
        
                // Decrement reserved quantity
                await prismaClient.inventoryItem.update({
                    where: { uuid: reservation.inventoryItemUuid },
                    data: {
                        reservedQuantity: { decrement: reservation.quantity },
                        lastUpdated: new Date(),
                    },
                });
        
                // Create inventory movement log
                await prismaClient.inventoryMovement.create({
                    data: {
                        tenantUuid: reservation.tenantUuid,
                        storeUuid: reservation.storeUuid,
                        inventoryItemUuid: reservation.inventoryItemUuid,
                        productUuid: reservation.productUuid,
                        type: "RELEASE",
                        quantity: reservation.quantity,
                        referenceType: "ORDER",
                        referenceUuid: input.orderUuid,
                        reason: "Reservation released (order cancelled/expired)",
                    },
                });
        
                logWithContext("info", "[Inventory] Reservation released", {
                    productUuid: reservation.productUuid,
                    quantity: reservation.quantity,
                    orderUuid: input.orderUuid,
                });
            }
        };
    
        if (input.tx) {
            await execute(input.tx);
        } else {
            await prisma.$transaction(async (tx) => {
                await execute(tx);
            });
        }
    
        MetricsService.increment("inventory.released", 1);
    }

    //Commit reservation (order paid)
    static async commitReservation(input: {
        orderUuid: string;
    }) {
        const reservations = await prisma.inventoryReservation.findMany({
            where: {
                orderUuid: input.orderUuid,
                status: "ACTIVE",
            },
        });

        for (const reservation of reservations) {
            // Mark as committed
            await prisma.inventoryReservation.update({
                where: { uuid: reservation.uuid },
                data: { status: "COMMITTED" },
            });

            // Decrease actual quantity
            await prisma.inventoryItem.update({
                where: { uuid: reservation.inventoryItemUuid },
                data: {
                quantity: { decrement: reservation.quantity },
                    reservedQuantity: { decrement: reservation.quantity },
                },
            });

            // Create transaction log
            await prisma.inventoryTransaction.create({
                data: {
                    tenantUuid: reservation.tenantUuid,
                    storeUuid: reservation.storeUuid,
                    inventoryItemUuid: reservation.inventoryItemUuid,
                    productUuid: reservation.productUuid,
                    quantity: -reservation.quantity,
                    reason: "ORDER_SALE",
                    orderUuid: input.orderUuid,
                },
            });
        };
    }

    static async getStatus(input:{
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
    }){
        const inventory= await prisma.inventoryItem.findFirst({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
            include: {
                product: true,
            },
        });

        if (!inventory) {
            return {
                exists: false,
                quantity: 0,
                available: 0,
                reserved: 0,
                status: "OUT_OF_STOCK",
            };
        };
      
        const available = inventory.quantity - (inventory.reservedQuantity || 0);
          
        let status: string;
        if (available <= 0) {
            status = "OUT_OF_STOCK";
        } else if (inventory.product.lowStockThreshold && available <= inventory.product.lowStockThreshold) {
            status = "LOW_STOCK";
        } else {
            status = "IN_STOCK";
        };

        return {
            exists: true,
            quantity: inventory.quantity,
            available,
            reserved: inventory.reservedQuantity || 0,
            lowStockThreshold: inventory.product.lowStockThreshold,
            status,
        };
    }
}