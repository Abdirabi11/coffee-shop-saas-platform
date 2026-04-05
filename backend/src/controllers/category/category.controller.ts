import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { CategoryCacheService } from "../../services/cache/CategoryCache.service.ts";
import { CategoryService } from "../../services/category.service.ts";

export class CategoryController {
  
    //POST /api/categories
    //Create category
    static async create(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;
    
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;

            // Validate input
            const validationResult = createCategorySchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validationResult.error.errors,
                });
            };

            const data = validationResult.data;

            const category = await CategoryService.create({
                tenantUuid,
                storeUuid,
                name: data.name,
                description: data.description,
                parentUuid: data.parentUuid,
                imageUrl: data.imageUrl,
                iconUrl: data.iconUrl,
                color: data.color,
                isFeatured: data.isFeatured,
                createdBy: userUuid,
            });

            logWithContext("info", "[Category] Category created", {
                traceId,
                categoryUuid: category.uuid,
            });

            MetricsService.increment("category.created", 1);

            return res.status(201).json({
                success: true,
                category,
            });
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to create category", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create category",
            });
        }
    }

    //GET /api/categories
    //List categories
    static async list(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const includeChildren = req.query.includeChildren === "true";

            // Use cache
            const categories = await CategoryCacheService.getCategories({
                tenantUuid,
                storeUuid,
                includeChildren,
            });

            return res.status(200).json({
                success: true,
                categories,
            });
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to list categories", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve categories",
            });
        }
    }

    //GET /api/categories/:uuid
    //Get single category
    static async getOne(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;

            const category = await CategoryService.getByUuid({
                tenantUuid,
                categoryUuid: uuid,
            });

            // Track view
            await CategoryService.trackView({
                tenantUuid,
                categoryUuid: uuid,
            });

            return res.status(200).json({
                success: true,
                category,
            });
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to get category", {
                traceId,
                error: error.message,
            });
        
            if (error.message === "CATEGORY_NOT_FOUND") {
                return res.status(404).json({
                    error: "CATEGORY_NOT_FOUND",
                    message: "Category not found",
                });
            };
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve category",
            });
        }
    }

    //PATCH /api/categories/:uuid
    //Update category
    static async update(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;
            const userUuid = req.user!.uuid;

            // Validate input
            const validationResult = updateCategorySchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    details: validationResult.error.errors,
                });
            }

            const category = await CategoryService.update({
                tenantUuid,
                categoryUuid: uuid,
                data: validationResult.data,
                updatedBy: userUuid,
            });

            return res.status(200).json({
                success: true,
                category,
            });
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to update category", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update category",
            });
        }
    }

    //DELETE /api/categories/:uuid
    //Delete category
    static async delete(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;
            const userUuid = req.user!.uuid;

            await CategoryService.delete({
                tenantUuid,
                categoryUuid: uuid,
                deletedBy: userUuid,
            });

            return res.status(204).send();
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to delete category", {
                traceId,
                error: error.message,
            });
        
            if (error.message === "CATEGORY_HAS_PRODUCTS") {
                return res.status(400).json({
                    error: "CATEGORY_HAS_PRODUCTS",
                    message: "Cannot delete category with active products",
                });
            };
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete category",
            });
        }
    }

    //PATCH /api/categories/reorder
    //Reorder categories
    static async reorder(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;
            const { orders } = req.body;

            if (!Array.isArray(orders)) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Orders must be an array",
                });
            }

            await CategoryService.reorder({
                tenantUuid,
                storeUuid,
                orders,
                updatedBy: userUuid,
            });

            return res.status(200).json({
                success: true,
            });
        } catch (error: any) {
            logWithContext("error", "[Category] Failed to reorder categories", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to reorder categories",
            });
        }
    }

    //GET /api/categories/:uuid/analytics
    //Get category analytics
    static async getAnalytics(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `cat_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;
            const { startDate, endDate } = req.query;

            const metrics = await prisma.categoryDailyMetrics.findMany({
                where: {
                    tenantUuid,
                    categoryUuid: uuid,
                    date: {
                        ...(startDate && { gte: new Date(startDate as string) }),
                        ...(endDate && { lte: new Date(endDate as string) }),
                    },
                },
                orderBy: { date: "asc" },
            });

            // Calculate totals
            const totals = metrics.reduce(
                (acc, m) => ({
                    itemsSold: acc.itemsSold + m.itemsSold,
                    revenue: acc.revenue + m.revenue,
                    ordersCount: acc.ordersCount + m.ordersCount,
                    viewCount: acc.viewCount + m.viewCount,
                }),
                { itemsSold: 0, revenue: 0, ordersCount: 0, viewCount: 0 }
            );

            return res.status(200).json({
                success: true,
                metrics,
                totals,
            });

        } catch (error: any) {
            logWithContext("error", "[Category] Failed to get analytics", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve analytics",
            });
        }
    }
}