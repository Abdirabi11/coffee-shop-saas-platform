import prisma from "../../config/prisma.ts";
import { MenuCacheService } from "../menu/menuCache.service.ts";
import { PlanLimitService } from "../billing/PlanLimit.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Every lookup and write is scoped to the caller's verified tenant (and store
// where one is given): a product or category of another tenant is simply not
// found. Routes already check the permission at the record's own store; this
// is the second layer.
export class ProductAdminService {

    // The category must be in the same tenant and store as the product, or the
    // product would show up in another store's (or tenant's) menu
    private static async assertCategoryInStore(tenantUuid: string, storeUuid: string, categoryUuid: string) {
        const category = await prisma.category.findFirst({
            where: { uuid: categoryUuid, tenantUuid, storeUuid },
            select: { uuid: true },
        });
        if (!category) throw new Error("CATEGORY_NOT_IN_STORE");
    }

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
        await this.assertCategoryInStore(input.tenantUuid, input.storeUuid, input.categoryUuid);

        // The plan's product limit is checked under the plan lock, in the same
        // transaction as the insert, so concurrent creates can't both take the
        // last slot
        const product = await prisma.$transaction(async (tx) => {
            await PlanLimitService.assertCanAdd(tx, input.tenantUuid, "maxProducts");

            return tx.product.create({
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
        tenantUuid: string;
        productUuid: string;
        updateData: Record<string, any>;
        triggeredBy: string;
    }) {
        const product = await prisma.product.findFirst({
            where: { uuid: input.productUuid, tenantUuid: input.tenantUuid },
        });

        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        if (input.updateData.categoryUuid !== undefined) {
            await this.assertCategoryInStore(product.tenantUuid, product.storeUuid, input.updateData.categoryUuid);
        }

        const priceChanged = input.updateData.basePrice && input.updateData.basePrice !== product.basePrice;

        const updated = await prisma.product.update({
            where: { uuid: input.productUuid, tenantUuid: input.tenantUuid },
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
        tenantUuid: string;
        productUuid: string;
        triggeredBy: string;
    }) {
        const product = await prisma.product.findFirst({
            where: { uuid: input.productUuid, tenantUuid: input.tenantUuid },
        });

        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        await prisma.product.delete({
            where: { uuid: input.productUuid, tenantUuid: input.tenantUuid },
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
                // Only products of this tenant and store; others report NOT_FOUND
                const product = await prisma.product.findFirst({
                    where: { uuid: update.productUuid, tenantUuid: input.tenantUuid, storeUuid: input.storeUuid },
                    select: { basePrice: true },
                });
                if (!product) {
                    results.push({ productUuid: update.productUuid, success: false, error: "PRODUCT_NOT_FOUND" });
                    continue;
                }

                await prisma.product.update({
                    where: { uuid: update.productUuid, tenantUuid: input.tenantUuid, storeUuid: input.storeUuid },
                    data: { basePrice: update.newPrice },
                });

                results.push({
                    productUuid: update.productUuid,
                    success: true,
                    oldPrice: product.basePrice, // read before the update (was the new price)
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
        const { count } = await prisma.product.updateMany({
            where: {
                uuid: { in: input.productUuids },
                tenantUuid: input.tenantUuid,
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

        return { updated: count, isAvailable: input.isAvailable };
    }
}