import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts"
import { AlertDedupService } from "../../services/alerts/AlertDedup.service.ts";

export class LowStockAlertJob{
    // storeUuids narrows the run to those stores
    static async run(opts: { storeUuids?: string[] } = {}){
        logWithContext("info", "[LowStockAlert] Starting check", {});

        try {
            // Get products with low stock
           const lowStockProducts = await prisma.product.findMany({
                where: {
                    trackInventory: true,
                    ...(opts.storeUuids && { storeUuid: { in: opts.storeUuids } }),
                    isActive: true,
                    isDeleted: false,
                    lowStockThreshold: { gt: 0 },
                },
                include: {
                    inventory: true,
                    store: true,
                },
            });

            let alertsCreated = 0;

            for(const product of lowStockProducts){
                if (!product.inventory || !product.lowStockThreshold) continue;

                if (product.inventory.quantity <= product.lowStockThreshold) {
                    // At most one alert per product per day; the job runs hourly
                    // while the product stays low
                    const alert = await AlertDedupService.createOnce({
                        groupKey: `LOW_STOCK:${product.uuid}`,
                        tenantUuid: product.tenantUuid,
                        storeUuid: product.storeUuid,
                        alertType: "INVENTORY_LOW",
                        category: "OPERATIONAL",
                        level: product.inventory.quantity === 0 ? "CRITICAL" : "WARNING",
                        priority: "HIGH",
                        title: "Low Stock Alert",
                        message: `Product "${product.name}" is ${product.inventory.quantity === 0 ? "out of stock" : "low on stock"}`,
                        affectedEntity: "product",
                        affectedEntityId: product.uuid,
                        context: {
                            productUuid: product.uuid,
                            productName: product.name,
                            currentStock: product.inventory.quantity,
                            threshold: product.lowStockThreshold,
                        },
                    });
                    if (!alert) continue;

                    // Emit event
                    EventBus.emit("PRODUCT_LOW_STOCK", {
                        tenantUuid: product.tenantUuid,
                        storeUuid: product.storeUuid,
                        productUuid: product.uuid,
                        productName: product.name,
                        currentStock: product.inventory.quantity,
                        threshold: product.lowStockThreshold,
                    });

                    alertsCreated++;
                }
            };

            logWithContext("info", "[LowStockAlert] Check completed", {
                productsChecked: lowStockProducts.length,
                alertsCreated,
            });
            return alertsCreated;
        } catch (error: any) {
            logWithContext("error", "[LowStockAlert] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}