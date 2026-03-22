import prisma from "../../config/prisma.ts"
import { eventBus } from "../../events/eventBus.ts";


export class InventoryAlertService {
    // CHECK ALL ITEMS for a store — called by LowStockCheckJob
    static async checkStoreLevels(tenantUuid: string, storeUuid: string) {
        const items = await prisma.inventoryItem.findMany({
            where: {
                tenantUuid,
                storeUuid,
                status: { not: "DISCONTINUED" },
            },
            include: { product: { select: { name: true } } },
        });
    
        const alerts: Array<{
            productUuid: string;
            productName: string;
            type: "LOW_STOCK" | "OUT_OF_STOCK";
            currentStock: number;
            threshold: number;
        }> = [];
    
        for (const item of items) {
            // Out of stock
            if (item.availableStock <= 0 && !item.outOfStockAlertSent) {
                alerts.push({
                    productUuid: item.productUuid,
                    productName: item.product?.name ?? "Unknown",
                    type: "OUT_OF_STOCK",
                    currentStock: item.availableStock,
                    threshold: 0,
                });
        
                await prisma.inventoryItem.update({
                    where: { uuid: item.uuid },
                    data: { status: "OUT_OF_STOCK", outOfStockAlertSent: true },
                });
                continue;
            }
    
            // Low stock (below reorder point)
            if (
                item.reorderPoint &&
                item.availableStock > 0 &&
                item.availableStock <= item.reorderPoint &&
                !item.lowStockAlertSent
            ) {
                alerts.push({
                    productUuid: item.productUuid,
                    productName: item.product?.name ?? "Unknown",
                    type: "LOW_STOCK",
                    currentStock: item.availableStock,
                    threshold: item.reorderPoint,
                });
        
                await prisma.inventoryItem.update({
                    where: { uuid: item.uuid },
                    data: { status: "LOW_STOCK", lowStockAlertSent: true },
                });
            }
        }
    
        // Create admin alert if issues found
        if (alerts.length > 0) {
            const outOfStock = alerts.filter((a) => a.type === "OUT_OF_STOCK");
            const lowStock = alerts.filter((a) => a.type === "LOW_STOCK");
    
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    alertType: "INVENTORY_LOW",
                    category: "OPERATIONAL",
                    level: outOfStock.length > 0 ? "ERROR" : "WARNING",
                    priority: outOfStock.length > 0 ? "HIGH" : "MEDIUM",
                    source: "AUTOMATED_CHECK",
                    title: `Inventory Alert: ${alerts.length} item(s) need attention`,
                    message: outOfStock.length > 0
                        ? `${outOfStock.length} OUT OF STOCK, ${lowStock.length} low stock`
                        : `${lowStock.length} item(s) below reorder point`,
                    context: {
                        outOfStock: outOfStock.map((a) => ({
                            product: a.productName,
                            stock: a.currentStock,
                        })),
                        lowStock: lowStock.map((a) => ({
                            product: a.productName,
                            stock: a.currentStock,
                            threshold: a.threshold,
                        })),
                    },
                },
            });
        
            eventBus.emit("INVENTORY_ALERT", { tenantUuid, storeUuid, alerts });
        }
    
        return alerts;
    }
    
    // GET LOW STOCK ITEMS — for dashboard display
    static async getLowStockItems(tenantUuid: string, storeUuid?: string) {
        return prisma.inventoryItem.findMany({
            where: {
                tenantUuid,
                ...(storeUuid && { storeUuid }),
                status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
            },
            include: {
                product: { select: { name: true, price: true } },
                store: { select: { name: true } },
            },
            orderBy: { availableStock: "asc" },
        });
    }
 
    static async getReorderSuggestions(tenantUuid: string, storeUuid: string) {
        const items = await prisma.inventoryItem.findMany({
            where: {
                tenantUuid,
                storeUuid,
                autoReorder: true,
                reorderPoint: { not: null },
                status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
            },
            include: { product: { select: { name: true } } },
        });
    
        return items.map((item) => ({
            productUuid: item.productUuid,
            productName: item.product?.name,
            currentStock: item.availableStock,
            reorderPoint: item.reorderPoint,
            suggestedQuantity: item.reorderQuantity
                ?? (item.maxStock ? item.maxStock - item.currentStock : 50),
            estimatedCost: item.lastPurchasePrice
                ? (item.reorderQuantity ?? 50) * item.lastPurchasePrice
                : null,
            unit: item.unit,
        }));
    }
}