import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class InventoryReconciliationJob {
    static cronSchedule = "30 2 * * *";
    
    static async run() {
        logWithContext("info", "[InventoryReconciliation] Starting");
    
        try {
            const driftFixed = await prisma.$executeRaw`
                UPDATE "InventoryItem"
                SET
                "availableStock" = GREATEST(0, "currentStock" - "reservedStock"),
                "quantity" = "currentStock",
                "reservedQuantity" = "reservedStock",
                "status" = CASE
                    WHEN "currentStock" <= 0 THEN 'OUT_OF_STOCK'::"InventoryStatus"
                    WHEN "reorderPoint" IS NOT NULL AND "currentStock" <= "reorderPoint" THEN 'LOW_STOCK'::"InventoryStatus"
                    ELSE 'IN_STOCK'::"InventoryStatus"
                END
                WHERE "availableStock" != GREATEST(0, "currentStock" - "reservedStock")
                OR "quantity" != "currentStock"
                OR "reservedQuantity" != "reservedStock"
            `;
    
            //Expire stale reservations (ACTIVE but older than 24h = something went wrong)
            const staleExpired = await prisma.inventoryReservation.updateMany({
                where: {
                    status: "ACTIVE",
                    createdAt: { lt: dayjs().subtract(24, "hour").toDate() },
                },
                data: {
                    status: "EXPIRED",
                    releasedAt: new Date(),
                },
            });
        
            //If we expired stale reservations, recalculate reservedStock from
            //actual ACTIVE reservations (source of truth)
            if (staleExpired.count > 0) {
                logWithContext("warn", "[InventoryReconciliation] Expired stale reservations", {
                    count: staleExpired.count,
                });
        
                // Get all items that had stale reservations and recalculate
                const affectedItems = await prisma.inventoryReservation.findMany({
                    where: {
                        status: "EXPIRED",
                        releasedAt: { gte: dayjs().subtract(5, "minute").toDate() },
                    },
                    select: { inventoryItemUuid: true },
                    distinct: ["inventoryItemUuid"],
                });
        
                for (const { inventoryItemUuid } of affectedItems) {
                    // Sum all currently ACTIVE reservations
                    const activeSum = await prisma.inventoryReservation.aggregate({
                            where: {
                            inventoryItemUuid,
                            status: "ACTIVE",
                        },
                        _sum: { quantity: true },
                    });
        
                    const reservedStock = activeSum._sum.quantity ?? 0;
            
                    const item = await prisma.inventoryItem.findUnique({
                        where: { uuid: inventoryItemUuid },
                        select: { currentStock: true },
                    });
            
                    if (item) {
                        await prisma.inventoryItem.update({
                            where: { uuid: inventoryItemUuid },
                            data: {
                                reservedStock,
                                reservedQuantity: reservedStock,
                                availableStock: Math.max(0, item.currentStock - reservedStock),
                            },
                        });
                    }
                }
            }
    
            //Reset alert flags for items that are back in stock
            await prisma.inventoryItem.updateMany({
                where: {
                    lowStockAlertSent: true,
                    status: "IN_STOCK",
                },
                data: {
                    lowStockAlertSent: false,
                    outOfStockAlertSent: false,
                },
            });
        
            logWithContext("info", "[InventoryReconciliation] Completed", {
                driftFixed,
                staleExpired: staleExpired.count,
            });
        
            return { driftFixed, staleExpired: staleExpired.count };
        } catch (error: any) {
            logWithContext("error", "[InventoryReconciliation] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}