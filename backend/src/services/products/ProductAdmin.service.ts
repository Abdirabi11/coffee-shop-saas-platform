import prisma from "../../config/prisma.ts";
import { MenuCacheService } from "../menu/menuCache.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class ProductAdminService {

    static async createProduct(input: {
        tenantUuid: string;
        storeUuid: string;
        categoryUuid: string;
        name: string;
        description?: string;
        imageUrl?: string;
        basePrice: number;
        sku?: string;
        trackInventory?: boolean;
        currentStock?: number;
        lowStockThreshold?: number;
        isActive?: boolean;
        isFeatured?: boolean;
        tags?: string[];
        calories?: number;
        preparationTime?: number;
        triggeredBy: string;
    }) {
        const product = await prisma.product.create({
            data: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                categoryUuid: input.categoryUuid,
                name: input.name,
                description: input.description,
                imageUrl: input.imageUrl,
                basePrice: input.basePrice,
                sku: input.sku,
                trackInventory: input.trackInventory,
                currentStock: input.currentStock,
                lowStockThreshold: input.lowStockThreshold,
                isActive: input.isActive,
                isFeatured: input.isFeatured,
                tags: input.tags,
                calories: input.calories,
                preparationTime: input.preparationTime,
            },
        });

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            reason: "PRODUCT_ADDED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[ProductAdmin] Product created", {
            productUuid: product.uuid,
            name: product.name,
            basePrice: product.basePrice,
        });

        return product;
    }

    static async updateProduct(input: {
        productUuid: string;
        updateData: Record<string, any>;
        triggeredBy: string;
    }) {
        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });

        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        const priceChanged = input.updateData.basePrice && input.updateData.basePrice !== product.basePrice;

        const updated = await prisma.product.update({
            where: { uuid: input.productUuid },
            data: input.updateData,
        });

        await MenuCacheService.invalidate({
            tenantUuid: product.tenantUuid,
            storeUuid: product.storeUuid,
            reason: priceChanged ? "PRICE_CHANGE" : "PRODUCT_UPDATED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[ProductAdmin] Product updated", {
            productUuid: input.productUuid,
            changes: Object.keys(input.updateData),
            priceChanged,
        });

        return updated;
    }

    static async deleteProduct(input: {
        productUuid: string;
        triggeredBy: string;
    }) {
        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });

        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        await prisma.product.delete({
            where: { uuid: input.productUuid },
        });

        await MenuCacheService.invalidate({
            tenantUuid: product.tenantUuid,
            storeUuid: product.storeUuid,
            reason: "PRODUCT_REMOVED",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[ProductAdmin] Product deleted", {
            productUuid: input.productUuid,
            name: product.name,
        });

        return { deleted: true, name: product.name };
    }

    static async bulkUpdatePrices(input: {
        tenantUuid: string;
        storeUuid: string;
        updates: Array<{ productUuid: string; newPrice: number }>;
        reason?: string;
        triggeredBy: string;
    }) {
        const results = [];

        for (const update of input.updates) {
            try {
                const product = await prisma.product.update({
                    where: { uuid: update.productUuid },
                    data: { basePrice: update.newPrice },
                });

                results.push({
                    productUuid: update.productUuid,
                    success: true,
                    oldPrice: product.basePrice,
                    newPrice: update.newPrice,
                });
            } catch {
                results.push({
                    productUuid: update.productUuid,
                    success: false,
                    error: "UPDATE_FAILED",
                });
            }
        }

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            reason: "PRICE_CHANGE",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[ProductAdmin] Bulk price update", {
            storeUuid: input.storeUuid,
            totalUpdates: input.updates.length,
            successful: results.filter((r) => r.success).length,
        });

        return {
            results,
            summary: {
                total: input.updates.length,
                successful: results.filter((r) => r.success).length,
                failed: results.filter((r) => !r.success).length,
            },
        };
    }

    static async bulkUpdateAvailability(input: {
        tenantUuid: string;
        storeUuid: string;
        productUuids: string[];
        isAvailable: boolean;
        reason?: string;
        triggeredBy: string;
    }) {
        await prisma.product.updateMany({
            where: {
                uuid: { in: input.productUuids },
                storeUuid: input.storeUuid,
            },
            data: { isAvailable: input.isAvailable },
        });

        await MenuCacheService.invalidate({
            tenantUuid: input.tenantUuid,
            storeUuid: input.storeUuid,
            reason: "AVAILABILITY_CHANGE",
            triggeredBy: input.triggeredBy,
        });

        logWithContext("info", "[ProductAdmin] Bulk availability update", {
            storeUuid: input.storeUuid,
            productCount: input.productUuids.length,
            isAvailable: input.isAvailable,
        });

        return { updated: input.productUuids.length, isAvailable: input.isAvailable };
    }
}