import type { Request, Response } from "express";
import prisma from "../../../config/prisma.ts"
import { MenuCacheService } from "../../../services/menu/menuCache.service.ts";
import { logWithContext } from "../../../infrastructure/observability/Logger.ts";

export class CategoryAdminController {
  
    //POST /api/admin/menu/categories
    static async createCategory(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuid,
                name,
                description,
                imageUrl,
                order,
                isActive,
                availableDays,
                timeSlots,
            } = req.body;

            const category = await prisma.category.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    name,
                    description,
                    imageUrl,
                    order,
                    isActive,
                    availableDays,
                    timeSlots,
                },
            });

            // Invalidate menu cache
            await MenuCacheService.invalidate({
                tenantUuid,
                storeUuid,
                reason: "CATEGORY_CREATED",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[CategoryAdmin] Category created", {
                categoryUuid: category.uuid,
                name: category.name,
            });

            return res.status(201).json({
                success: true,
                category,
            });

        } catch (error: any) {
            logWithContext("error", "[CategoryAdmin] Create failed", {
                error: error.message,
            });

            if (error.code === "P2002") {
                return res.status(400).json({
                    error: "DUPLICATE_CATEGORY",
                    message: "A category with this name already exists",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create category",
            });
        }
    }

    //PATCH /api/admin/menu/categories/:categoryUuid
    static async updateCategory(req: Request, res: Response) {
        try {
            const { categoryUuid } = req.params;
            const updateData = req.body;

            const category = await prisma.category.findUnique({
                where: { uuid: categoryUuid },
            });

            if (!category) {
                return res.status(404).json({
                    error: "CATEGORY_NOT_FOUND",
                    message: "Category not found",
                });
            }

            const updated = await prisma.category.update({
                where: { uuid: categoryUuid },
                data: updateData,
            });

            // Invalidate menu cache
            await MenuCacheService.invalidate({
                tenantUuid: category.tenantUuid,
                storeUuid: category.storeUuid,
                reason: "CATEGORY_UPDATED",
                triggeredBy: req.user!.uuid,
            });

            logWithContext("info", "[CategoryAdmin] Category updated", {
                categoryUuid,
                changes: Object.keys(updateData),
            });

            return res.status(200).json({
                success: true,
                category: updated,
            });

        } catch (error: any) {
            logWithContext("error", "[CategoryAdmin] Update failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update category",
            });
        }
    }

    //DELETE /api/admin/menu/categories/:categoryUuid
    static async deleteCategory(req: Request, res: Response) {
        try {
            const { categoryUuid } = req.params;

            const category = await prisma.category.findUnique({
                where: { uuid: categoryUuid },
                include: {
                    products: {
                        select: { uuid: true },
                    },
                },
            });

            if (!category) {
                return res.status(404).json({
                    error: "CATEGORY_NOT_FOUND",
                    message: "Category not found",
                });
            }

        if (category.products.length > 0) {
            return res.status(400).json({
            error: "CATEGORY_HAS_PRODUCTS",
            message: "Cannot delete category with products. Delete or move products first.",
            productCount: category.products.length,
            });
        }

        await prisma.category.delete({
            where: { uuid: categoryUuid },
        });

        // Invalidate menu cache
        await MenuCacheService.invalidate({
            tenantUuid: category.tenantUuid,
            storeUuid: category.storeUuid,
            reason: "CATEGORY_DELETED",
            triggeredBy: req.user!.uuid,
        });

        logWithContext("info", "[CategoryAdmin] Category deleted", {
            categoryUuid,
            name: category.name,
        });

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
        });

        } catch (error: any) {
            logWithContext("error", "[CategoryAdmin] Delete failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete category",
            });
        }
    }

    //GET /api/admin/menu/categories/:storeUuid
    static async getCategories(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;

            const categories = await prisma.category.findMany({
                where: { storeUuid },
                orderBy: { order: "asc" },
                include: {
                    products: {
                        select: {
                            uuid: true,
                            name: true,
                            isActive: true,
                            isAvailable: true,
                        },
                    },
                },
            });

            return res.status(200).json({
                success: true,
                categories,
            });

        } catch (error: any) {
            logWithContext("error", "[CategoryAdmin] Get categories failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve categories",
            });
        }
    }
}