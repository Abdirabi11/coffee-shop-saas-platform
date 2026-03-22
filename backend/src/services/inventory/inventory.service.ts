import prisma from "../../config/prisma.ts"
import { eventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class InventoryService{

    static async adjustStock(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        quantity: number; // Positive = increase, Negative = decrease
        type: "RESTOCK" | "ADJUSTMENT" | "WASTE" | "DAMAGE" | "TRANSFER" | "RETURN";
        reason: string;
        adjustedBy: string;
    }) {
        const inventory = await prisma.inventoryItem.findFirst({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
        });
    
        if (!inventory) {
            throw new Error("INVENTORY_NOT_FOUND");
        };
 
        const newCurrentStock = inventory.currentStock + input.quantity;
            if (newCurrentStock < 0) {
            throw new Error("INSUFFICIENT_STOCK");
        };
    
        const newAvailableStock = newCurrentStock - inventory.reservedStock;
        const newStatus = newCurrentStock <= 0
            ? "OUT_OF_STOCK"
            : (inventory.reorderPoint && newCurrentStock <= inventory.reorderPoint)
                ? "LOW_STOCK"
                : "IN_STOCK";

        const updated = await prisma.inventoryItem.update({
            where: { uuid: inventory.uuid },
            data: {
                currentStock: newCurrentStock,
                availableStock: Math.max(0, newAvailableStock),
                quantity: newCurrentStock,
                status: newStatus,
                lastUpdated: new Date(),
                ...(input.type === "RESTOCK" && {
                    lastRestockedAt: new Date(),
                    lastRestockedBy: input.adjustedBy,
                    lastRestockQty: Math.abs(input.quantity),
                    lastRestocked: new Date(),
                }),
            },
        });
 
        // Movement log (all required fields included)
        await prisma.inventoryMovement.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid, // Was missing in some old code paths
                inventoryItemUuid: inventory.uuid,
                productUuid: input.productUuid, // Was missing in some old code paths
                type: input.type,
                quantity: input.quantity,
                previousStock: inventory.currentStock,
                newStock: newCurrentStock,
                referenceType: "MANUAL",
                reason: input.reason,
                performedBy: input.adjustedBy,
            },
        });
 
        await prisma.inventoryTransaction.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                inventoryItemUuid: inventory.uuid,
                productUuid: input.productUuid,
                quantity: input.quantity,
                previousQuantity: inventory.currentStock, // FIX: was `previousStock`
                newQuantity: newCurrentStock,              // FIX: was `newStock`
                reason: input.type,
                createdBy: input.adjustedBy,
            },
        });
 
        // Low stock alert (use InventoryItem.reorderPoint, not Product.lowStockThreshold)
        if (inventory.reorderPoint && newCurrentStock <= inventory.reorderPoint) {
            if (!inventory.lowStockAlertSent) {
                const product = await prisma.product.findUnique({
                    where: { uuid: input.productUuid },
                    select: { name: true },
                });
        
                eventBus.emit("INVENTORY_LOW_STOCK", {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    productUuid: input.productUuid,
                    productName: product?.name,
                    currentStock: newCurrentStock,
                    threshold: inventory.reorderPoint,
                });
        
                await prisma.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: { lowStockAlertSent: true },
                });
            }
        } else if (inventory.lowStockAlertSent) {
            await prisma.inventoryItem.update({
                where: { uuid: inventory.uuid },
                data: { lowStockAlertSent: false, outOfStockAlertSent: false },
            });
        }
    
        logWithContext("info", "[Inventory] Stock adjusted", {
            productUuid: input.productUuid,
            type: input.type,
            adjustment: input.quantity,
            newStock: newCurrentStock,
        });
    
        MetricsService.increment("inventory.adjusted", 1, { type: input.type });
        return updated;
    }
 
    static async checkStock(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
        requestedQuantity: number;
    }): Promise<{ available: boolean; currentStock: number; availableStock: number }> {
        const inventory = await prisma.inventoryItem.findFirst({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
        });
    
        if (!inventory) {
            return { available: false, currentStock: 0, availableStock: 0 };
        }
    
        // Use availableStock (currentStock - reservedStock) — NOT the old quantity - reservedQuantity
        return {
            available: inventory.availableStock >= input.requestedQuantity,
            currentStock: inventory.currentStock,
            availableStock: inventory.availableStock,
        };
    }
    
    static async checkBulkAvailability(input: {
        tenantUuid: string;
        storeUuid: string;
        items: Array<{ productUuid: string; quantity: number }>;
    }) {
        const unavailable: Array<{
            productUuid: string;
            requested: number;
            available: number;
        }> = [];
    
        for (const item of input.items) {
            const result = await this.checkStock({
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: item.productUuid,
                requestedQuantity: item.quantity,
            });
        
            if (!result.available) {
                unavailable.push({
                    productUuid: item.productUuid,
                    requested: item.quantity,
                    available: result.availableStock,
                });
            }
        }
    
        return { allAvailable: unavailable.length === 0, unavailable };
    }

    static async getStatus(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuid: string;
    }) {
        const inventory = await prisma.inventoryItem.findFirst({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
            },
            include: { product: { select: { name: true } } },
        });
    
        if (!inventory) {
            return { exists: false, status: "NOT_TRACKED" as const };
        }
    
        return {
            exists: true,
            productName: inventory.product?.name,
            currentStock: inventory.currentStock,
            reservedStock: inventory.reservedStock,
            availableStock: inventory.availableStock,
            reorderPoint: inventory.reorderPoint,
            minStock: inventory.minStock,
            unit: inventory.unit,
            status: inventory.status,
            lastRestockedAt: inventory.lastRestockedAt,
            autoReorder: inventory.autoReorder,
            averageCost: inventory.averageCost,
        };
    }
 
    static async getStoreInventory(input: {
        tenantUuid: string;
        storeUuid: string;
        status?: string;
        limit?: number;
    }) {
        return prisma.inventoryItem.findMany({
            where: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                ...(input.status && { status: input.status as any }),
            },
            include: { product: { select: { name: true, price: true } } },
            orderBy: { availableStock: "asc" },
            take: input.limit ?? 100,
        });
    }
}