import { Request, Response } from "express";
import prisma from "../../../config/prisma.ts"
import { logWithContext } from "../../../infrastructure/observability/Logger.ts";
import { MenuCacheService } from "../../../services/menu/menuCache.service.ts";



export class ProductAdminController {
  
    //POST /api/admin/menu/products
    static async createProduct(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuid,
                categoryUuid,
                name,
                description,
                imageUrl,
                basePrice,
                sku,
                trackInventory,
                currentStock,
                lowStockThreshold,
                isActive,
                isFeatured,
                tags,
                calories,
                preparationTime,
            } = req.body;

            const product = await prisma.product.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    categoryUuid,
                    name,
                    description,
                    imageUrl,
                    basePrice,
                    sku,
                    trackInventory,
                    currentStock,
                    lowStockThreshold,
                    isActive,
                    isFeatured,
                    tags,
                    calories,
                    preparationTime,
                },
            });

            // Invalidate menu cache
            await MenuCacheService.invalidate({
                tenantUuid,
                storeUuid,
                reason: "PRODUCT_ADDED",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[ProductAdmin] Product created", {
                productUuid: product.uuid,
                name: product.name,
                basePrice: product.basePrice,
            });

            return res.status(201).json({
                success: true,
                product,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAdmin] Create failed", {
                error: error.message,
            });

            if (error.code === "P2002") {
                return res.status(400).json({
                    error: "DUPLICATE_PRODUCT",
                    message: "A product with this name already exists in this category",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create product",
            });
        }
    }

    //PATCH /api/admin/menu/products/:productUuid
    static async updateProduct(req: Request, res: Response) {
        try {
            const { productUuid } = req.params;
            const updateData = req.body;

            const product = await prisma.product.findUnique({
                where: { uuid: productUuid },
            });

            if (!product) {
                return res.status(404).json({
                    error: "PRODUCT_NOT_FOUND",
                    message: "Product not found",
                });
            }

            // Check if price changed
            const priceChanged = updateData.basePrice && updateData.basePrice !== product.basePrice;

            const updated = await prisma.product.update({
                where: { uuid: productUuid },
                data: updateData,
            });

            // Invalidate menu cache
            await MenuCacheService.invalidate({
                tenantUuid: product.tenantUuid,
                storeUuid: product.storeUuid,
                reason: priceChanged ? "PRICE_CHANGE" : "PRODUCT_UPDATED",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[ProductAdmin] Product updated", {
                productUuid,
                changes: Object.keys(updateData),
                priceChanged,
            });

            return res.status(200).json({
                success: true,
                product: updated,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAdmin] Update failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update product",
            });
        }
    }

    //DELETE /api/admin/menu/products/:productUuid
    static async deleteProduct(req: Request, res: Response) {
        try {
            const { productUuid } = req.params;

            const product = await prisma.product.findUnique({
                where: { uuid: productUuid },
            });

            if (!product) {
                return res.status(404).json({
                error: "PRODUCT_NOT_FOUND",
                message: "Product not found",
                });
            }

            await prisma.product.delete({
                where: { uuid: productUuid },
            });

            // Invalidate menu cache
            await MenuCacheService.invalidate({
                tenantUuid: product.tenantUuid,
                storeUuid: product.storeUuid,
                reason: "PRODUCT_REMOVED",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[ProductAdmin] Product deleted", {
                productUuid,
                name: product.name,
            });

            return res.status(200).json({
                success: true,
                message: "Product deleted successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAdmin] Delete failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete product",
            });
        }
    }

    //POST /api/admin/menu/products/bulk/prices
    static async bulkUpdatePrices(req: Request, res: Response) {
        try {
            const { storeUuid, updates, reason } = req.body;

            const results = [];
      
            for (const update of updates) {
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

                } catch (error) {
                    results.push({
                        productUuid: update.productUuid,
                        success: false,
                        error: "UPDATE_FAILED",
                    });
                }
            };

            // Invalidate menu cache
            const tenantUuid = req.tenant!.uuid;
            await MenuCacheService.invalidate({
                tenantUuid,
                storeUuid,
                reason: "PRICE_CHANGE",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[ProductAdmin] Bulk price update", {
                storeUuid,
                totalUpdates: updates.length,
                successful: results.filter(r => r.success).length,
                reason,
            });

            return res.status(200).json({
                success: true,
                results,
                summary: {
                    total: updates.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length,
                },
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAdmin] Bulk update failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update prices",
            });
        }
    }

    //POST /api/admin/menu/products/bulk/availability
    static async bulkUpdateAvailability(req: Request, res: Response) {
        try {
            const { storeUuid, productUuids, isAvailable, reason } = req.body;

            await prisma.product.updateMany({
                where: {
                    uuid: { in: productUuids },
                    storeUuid,
                },
                data: { isAvailable },
            });

            // Invalidate menu cache
            const tenantUuid = req.tenant!.uuid;
            await MenuCacheService.invalidate({
                tenantUuid,
                storeUuid,
                reason: "AVAILABILITY_CHANGE",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[ProductAdmin] Bulk availability update", {
                storeUuid,
                productCount: productUuids.length,
                isAvailable,
                reason,
            });

            return res.status(200).json({
                success: true,
                updated: productUuids.length,
                isAvailable,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAdmin] Bulk availability update failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update availability",
            });
        }
    }
}