import { run } from "node:test";
import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts"

export class LowStockAlertJob{
    static async run(){
        logWithContext("info", "[LowStockAlert] Starting check");

        try {
            // Get products with low stock
            const lowStockProducts = await prisma.product.findMany({
                where: {
                    trackInventory: true,
                    isActive: true,
                    isDeleted: false,
                    inventory: {
                    quantity: {
                        lte: prisma.product.fields.lowStockThreshold,
                    },
                    },
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
                    // Create admin alert
                    await prisma.adminAlert.create({
                        data: {
                            tenantUuid: product.tenantUuid,
                            storeUuid: product.storeUuid,
                            alertType: "LOW_STOCK",
                            category: "INVENTORY",
                            level: product.inventory.quantity === 0 ? "CRITICAL" : "WARNING",
                            priority: "HIGH",
                            title: "Low Stock Alert",
                            message: `Product "${product.name}" is ${product.inventory.quantity === 0 ? "out of stock" : "low on stock"}`,
                            context: {
                                productUuid: product.uuid,
                                productName: product.name,
                                currentStock: product.inventory.quantity,
                                threshold: product.lowStockThreshold,
                            },
                        },
                    });

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
        } catch (error: any) {
            logWithContext("error", "[LowStockAlert] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}