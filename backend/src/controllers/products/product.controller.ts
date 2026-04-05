import type { Request, Response, NextFunction } from "express"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ProductService } from "../../services/products/product.service.ts";
import { createProductSchema, updateProductSchema } from "../../validators/product.validator.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


export class ProductController {
    static async create(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
      
        try {
            // Extract context
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;
    
            // Validate input
            const validationResult = createProductSchema.safeParse(req.body);
            if (!validationResult.success) {
                logWithContext("warn", "[Product] Validation failed", {
                    traceId,
                    errors: validationResult.error.errors,
                });
                
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Invalid product data",
                    details: validationResult.error.errors.map(e => ({
                        field: e.path.join("."),
                        message: e.message,
                    })),
                });
            };
    
            // Create product
            const product = await ProductService.create({
                tenantUuid,
                storeUuid,
                data: validationResult.data,
                createdBy: userUuid,
            });
    
            logWithContext("info", "[Product] Product created successfully", {
                traceId,
                productUuid: product.uuid,
                tenantUuid,
                storeUuid,
            });
    
            MetricsService.increment("product.create.success", 1, {
                tenantUuid,
                storeUuid,
            });
    
            return res.status(201).json({
                success: true,
                product,
            });
    
        } catch (error: any) {
            logWithContext("error", "[Product] Failed to create product", {
                traceId,
                error: error.message,
                stack: error.stack,
            });

            MetricsService.increment("product.create.error", 1);
    
            // Handle specific errors
            if (error.code === "P2002") {
                return res.status(409).json({
                    error: "DUPLICATE_SKU",
                    message: "A product with this SKU already exists",
                });
            }
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create product",
            });
        }
    }
  
    //List products with filters and pagination
    static async list(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
    
            // Parse query parameters
            const filters = {
                categoryUuid: req.query.categoryUuid as string,
                isActive: req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined,
                isFeatured: req.query.isFeatured === "true",
                search: req.query.search as string,
                tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
            };
    
            const pagination = {
                page: parseInt(req.query.page as string) || 1,
                limit: Math.min(parseInt(req.query.limit as string) || 50, 100), // Max 100
            };
    
            // Get products
            const result = await ProductService.list({
                tenantUuid,
                storeUuid,
                filters,
                pagination,
            });
    
            logWithContext("info", "[Product] Products listed", {
                traceId,
                count: result.products.length,
                total: result.pagination.total,
            });
    
            return res.status(200).json({
                success: true,
                ...result,
            });
    
        } catch (error: any) {
            logWithContext("error", "[Product] Failed to list products", {
                traceId,
                error: error.message,
            });
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve products",
            });
        }
    }
  
    static async getOne(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const { productUuid } = req.params;
    
            // Check if availability check is requested
            const checkAvailability = req.query.checkAvailability === "true";
    
            const product = await ProductService.getByUuid({
                tenantUuid,
                storeUuid,
                productUuid,
                checkAvailability,
            });
  
            if (!product) {
                return res.status(404).json({
                    error: "PRODUCT_NOT_FOUND",
                    message: "Product not found",
                });
            }
    
            logWithContext("info", "[Product] Product retrieved", {
                traceId,
                productUuid,
            });
    
            return res.status(200).json({
                success: true,
                product,
            });
  
        } catch (error: any) {
            logWithContext("error", "[Product] Failed to get product", {
                traceId,
                error: error.message,
            });
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve product",
            });
        }
    }
  
    static async update(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;
            const { productUuid } = req.params;
    
            // Validate input
            const validationResult = updateProductSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Invalid product data",
                    details: validationResult.error.errors.map(e => ({
                        field: e.path.join("."),
                        message: e.message,
                    })),
                });
            }
    
            // Update product
            const product = await ProductService.update({
                tenantUuid,
                storeUuid,
                productUuid,
                data: validationResult.data,
                updatedBy: userUuid,
            });
    
            logWithContext("info", "[Product] Product updated", {
                traceId,
                productUuid,
                changes: Object.keys(validationResult.data),
            });
    
            MetricsService.increment("product.update.success", 1, {
                tenantUuid,
                storeUuid,
            });
    
            return res.status(200).json({
                success: true,
                product,
            });
    
        } catch (error: any) {
                logWithContext("error", "[Product] Failed to update product", {
                traceId,
                error: error.message,
            });
    
            MetricsService.increment("product.update.error", 1);
  
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({
                    error: "PRODUCT_NOT_FOUND",
                    message: "Product not found",
                });
            }
  
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update product",
            });
        }
    }

    //Soft delete product
    static async delete(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
      
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;
            const { productUuid } = req.params;
    
            await ProductService.softDelete({
                tenantUuid,
                storeUuid,
                productUuid,
                deletedBy: userUuid,
            });
    
            logWithContext("info", "[Product] Product deleted", {
                traceId,
                productUuid,
            });
    
            MetricsService.increment("product.delete.success", 1, {
                tenantUuid,
                storeUuid,
            });
    
            return res.status(204).send();
    
        } catch (error: any) {
            logWithContext("error", "[Product] Failed to delete product", {
                traceId,
                error: error.message,
            });
    
            MetricsService.increment("product.delete.error", 1);
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete product",
            });
        }
    }
  
    //PATCH /api/products/bulk
    //Bulk update products
    static async bulkUpdate(req: Request, res: Response) {
      const traceId = req.headers["x-trace-id"] as string || `prod_${Date.now()}`;
      
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const userUuid = req.user!.uuid;
    
            const { productUuids, data } = req.body;
    
            if (!productUuids || !Array.isArray(productUuids) || productUuids.length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "productUuids array is required",
                });
            }
    
            if (productUuids.length > 100) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Maximum 100 products can be updated at once",
                });
            }
    
            const result = await ProductService.bulkUpdate({
                tenantUuid,
                storeUuid,
                productUuids,
                data,
                updatedBy: userUuid,
            });
    
            logWithContext("info", "[Product] Bulk update completed", {
                traceId,
                count: result.count,
            });
    
            return res.status(200).json({
                success: true,
                updated: result.count,
            });
    
        } catch (error: any) {
            logWithContext("error", "[Product] Bulk update failed", {
                traceId,
                error: error.message,
            });
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to bulk update products",
            });
        }
    }


    //pagination
    // const result = await ProductService.list({ ... });
    // addPaginationHeaders(res, result.pagination);
    // return res.json(result.products);
}