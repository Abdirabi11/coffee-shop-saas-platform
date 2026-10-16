import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { eventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { InventoryOrderService } from "./InventoryOrder.service.ts";

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
        if (!Number.isInteger(input.quantity) || input.quantity === 0) {
            throw new Error("INVALID_QUANTITY");
        }

        const { updated, alertLowStock } = await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventoryItem.findFirst({
                where: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    productUuid: input.productUuid,
                },
                select: { uuid: true },
            });

            if (!inventory) {
                throw new Error("INVENTORY_NOT_FOUND");
            };

            // One statement, relative to the row as it stands under its lock:
            // reservations and sales landing at the same time change the same
            // row and are never overwritten (the old read-then-write-absolute
            // values could erase them). A deduction may not take stock that
            // orders have reserved.
            const [row] = await tx.$queryRaw<Array<{
                currentStock: number;
                reorderPoint: number | null;
            }>>`
                UPDATE "InventoryItem"
                SET "currentStock"   = "currentStock" + ${input.quantity},
                    "quantity"       = "currentStock" + ${input.quantity},
                    "availableStock" = GREATEST(0, "currentStock" + ${input.quantity} - "reservedStock"),
                    "lastUpdated"    = NOW()
                WHERE "uuid" = ${inventory.uuid}
                ${input.quantity < 0
                    ? Prisma.sql`AND "currentStock" + ${input.quantity} >= "reservedStock"`
                    : Prisma.empty}
                RETURNING "currentStock", "reorderPoint"
            `;

            if (!row) {
                throw new Error("INSUFFICIENT_STOCK");
            };

            const newCurrentStock = row.currentStock;
            const previousStock = newCurrentStock - input.quantity;

            if (input.type === "RESTOCK") {
                await tx.inventoryItem.update({
                    where: { uuid: inventory.uuid },
                    data: {
                        lastRestockedAt: new Date(),
                        lastRestockedBy: input.adjustedBy,
                        lastRestockQty: Math.abs(input.quantity),
                        lastRestocked: new Date(),
                    },
                });
            }

            await InventoryOrderService.refreshStatus(tx, inventory.uuid);

            // Movement log (all required fields included)
            await tx.inventoryMovement.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    inventoryItemUuid: inventory.uuid,
                    productUuid: input.productUuid,
                    type: input.type,
                    quantity: input.quantity,
                    previousStock,
                    newStock: newCurrentStock,
                    referenceType: "MANUAL",
                    reason: input.reason,
                    performedBy: input.adjustedBy,
                },
            });

            await tx.inventoryTransaction.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    storeUuid: input.storeUuid,
                    inventoryItemUuid: inventory.uuid,
                    productUuid: input.productUuid,
                    quantity: input.quantity,
                    previousQuantity: previousStock,
                    newQuantity: newCurrentStock,
                    reason: input.type,
                    createdBy: input.adjustedBy,
                },
            });

            // Low stock alert (use InventoryItem.reorderPoint, not Product.lowStockThreshold).
            // The flag is claimed with a conditional update, so concurrent
            // adjustments raise one alert between them.
            let alertLowStock = false;
            if (row.reorderPoint !== null && newCurrentStock <= row.reorderPoint) {
                const claim = await tx.inventoryItem.updateMany({
                    where: { uuid: inventory.uuid, lowStockAlertSent: false },
                    data: { lowStockAlertSent: true },
                });
                alertLowStock = claim.count === 1;
            } else if (newCurrentStock > 0) {
                await tx.inventoryItem.updateMany({
                    where: {
                        uuid: inventory.uuid,
                        OR: [{ lowStockAlertSent: true }, { outOfStockAlertSent: true }],
                    },
                    data: { lowStockAlertSent: false, outOfStockAlertSent: false },
                });
            }

            const updated = await tx.inventoryItem.findUniqueOrThrow({
                where: { uuid: inventory.uuid },
            });

            return { updated, alertLowStock };
        });

        // After the commit, so a rolled-back adjustment never raises an alert
        if (alertLowStock) {
            const product = await prisma.product.findUnique({
                where: { uuid: input.productUuid },
                select: { name: true },
            });

            eventBus.emit("INVENTORY_LOW_STOCK", {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                productName: product?.name,
                currentStock: updated.currentStock,
                threshold: updated.reorderPoint,
            });
        }

        logWithContext("info", "[Inventory] Stock adjusted", {
            productUuid: input.productUuid,
            type: input.type,
            adjustment: input.quantity,
            newStock: updated.currentStock,
        });

        MetricsService.increment("inventory.adjusted", 1, { type: input.type });
        return updated;
    }

    // Releases an order's ACTIVE reservations (ExpiredReservationCleanupJob).
    // InventoryOrderService.releaseForOrder claims each reservation
    // conditionally, so calling this once per reservation of the same order is
    // safe: the first call releases them all and the rest are no-ops.
    static async releaseStock(input: { orderUuid: string }) {
        return InventoryOrderService.releaseForOrder({ orderUuid: input.orderUuid });
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