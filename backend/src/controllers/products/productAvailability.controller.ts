import type { Request, Response, NextFunction } from "express"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ProductAvailabilityService } from "../../services/products/productAvailability.service.ts";
import { createProductAvailabilitySchema } from "../../validators/product.validator.ts";

export class ProductAvailabilityController{
    static async create(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `avail_${Date.now()}`;
    
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const { productUuid } = req.params;
        
            // Validate input
            const validationResult = createProductAvailabilitySchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Invalid availability data",
                    details: validationResult.error.errors.map(e => ({
                        field: e.path.join("."),
                        message: e.message,
                    })),
                });
            };
    
            const availability = await ProductAvailabilityService.add({
                tenantUuid,
                storeUuid,
                productUuid,
                data: validationResult.data,
            });
        
            logWithContext("info", "[ProductAvailability] Schedule added", {
                traceId,
                productUuid,
                availabilityUuid: availability.uuid,
            });
        
            return res.status(201).json({
                success: true,
                availability,
            });
    
        } catch (error: any) {
            logWithContext("error", "[ProductAvailability] Failed to add schedule", {
                traceId,
                error: error.message,
            });
    
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to add availability schedule",
            });
        }
    }

    //GET /api/products/:productUuid/availability
    //List availability schedules
    static async list(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `avail_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const { productUuid } = req.params;

            const schedules = await ProductAvailabilityService.list({
                tenantUuid,
                storeUuid,
                productUuid,
            });

            return res.status(200).json({
                success: true,
                schedules,
            });
        } catch (error: any) {
            logWithContext("error", "[ProductAvailability] Failed to list schedules", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve availability schedules",
            });
        }
    }

    //PATCH /api/availability/:uuid
    //Update availability schedule
    static async update(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `avail_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;

            const availability = await ProductAvailabilityService.update({
                tenantUuid,
                uuid,
                data: req.body,
            });

            logWithContext("info", "[ProductAvailability] Schedule updated", {
                traceId,
                availabilityUuid: uuid,
            });

            return res.status(200).json({
                success: true,
                availability,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAvailability] Failed to update schedule", {
                traceId,
                error: error.message,
            });

            if (error.code === "P2025") {
                return res.status(404).json({
                    error: "SCHEDULE_NOT_FOUND",
                    message: "Availability schedule not found",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update availability schedule",
            });
        }
    }

    //DELETE /api/availability/:uuid
    //Delete availability schedule
    static async delete(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `avail_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { uuid } = req.params;

            await ProductAvailabilityService.delete({
                tenantUuid,
                uuid,
            });

            logWithContext("info", "[ProductAvailability] Schedule deleted", {
                traceId,
                availabilityUuid: uuid,
            });

            return res.status(204).send();

        } catch (error: any) {
            logWithContext("error", "[ProductAvailability] Failed to delete schedule", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete availability schedule",
            });
        }
    }

    //GET /api/products/:productUuid/availability/check
    //Check if product is currently available
    static async checkAvailability(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `avail_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.store!.uuid;
            const { productUuid } = req.params;

            const now = new Date();
            const isAvailable = await ProductAvailabilityService.isProductAvailable({
                tenantUuid,
                storeUuid,
                productUuid,
                now,
            });

            return res.status(200).json({
                success: true,
                productUuid,
                isAvailable,
                checkedAt: now.toISOString(),
            });

        } catch (error: any) {
            logWithContext("error", "[ProductAvailability] Failed to check availability", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to check product availability",
            });
        }
    }
}