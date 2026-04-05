import type { Request, Response, NextFunction } from "express"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ProductOptionService } from "../../services/products/product-option.service.ts";
import { createOptionSchema } from "../../validators/product.validator.ts";

export class ProductOptionController{
    static async createGroup(req: Request, res: Response){
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { productUuid } = req.params;

            // Validate input
            const validationResult = createOptionGroupSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Invalid option group data",
                    details: validationResult.error.errors.map(e => ({
                        field: e.path.join("."),
                        message: e.message,
                    })),
                });
            };

            const group = await ProductOptionService.createGroup({
                tenantUuid,
                productUuid,
                data: validationResult.data,
            });
        
            logWithContext("info", "[ProductOption] Option group created", {
                traceId,
                groupUuid: group.uuid,
                productUuid,
            });
        
            return res.status(201).json({
                success: true,
                group,
            });
        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to create group", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create option group",
            }); 
        }
    }

    //GET /api/products/:productUuid/option-groups
    //List option groups
    static async listGroups(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { productUuid } = req.params;

            const groups = await ProductOptionService.listGroups({
                tenantUuid,
                productUuid,
            });

            return res.status(200).json({
                success: true,
                groups,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to list groups", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to retrieve option groups",
            });
        }
    }

    //PATCH /api/option-groups/:groupUuid
    //Update option group
    static async updateGroup(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
    
        try {
            const tenantUuid = req.tenant!.uuid;
            const { groupUuid } = req.params;

            const group = await ProductOptionService.updateGroup({
                tenantUuid,
                groupUuid,
                data: req.body,
            });

            logWithContext("info", "[ProductOption] Option group updated", {
                traceId,
                groupUuid,
            });

            return res.status(200).json({
                success: true,
                group,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to update group", {
                traceId,
                error: error.message,
            });

            if (error.code === "P2025") {
                return res.status(404).json({
                    error: "GROUP_NOT_FOUND",
                    message: "Option group not found",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update option group",
            });
        }
    }

    //DELETE /api/option-groups/:groupUuid
    //Delete option group
    static async deleteGroup(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { groupUuid } = req.params;

            await ProductOptionService.deleteGroup({
                tenantUuid,
                groupUuid,
            });

            logWithContext("info", "[ProductOption] Option group deleted", {
                traceId,
                groupUuid,
            });

            return res.status(204).send();

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to delete group", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete option group",
            });
        }
    }

    //POST /api/option-groups/:groupUuid/options
    //Create option
    static async createOption(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { groupUuid } = req.params;

            // Validate input
            const validationResult = createOptionSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Invalid option data",
                    details: validationResult.error.errors.map(e => ({
                        field: e.path.join("."),
                        message: e.message,
                    })),
                });
            }

            const option = await ProductOptionService.createOption({
                tenantUuid,
                groupUuid,
                data: validationResult.data,
            });

            logWithContext("info", "[ProductOption] Option created", {
                traceId,
                optionUuid: option.uuid,
                groupUuid,
            });

            return res.status(201).json({
                success: true,
                option,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to create option", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create option",
            });
        }
    }

    //PATCH /api/options/:optionUuid
    //Update option
    static async updateOption(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { optionUuid } = req.params;

            const option = await ProductOptionService.updateOption({
                tenantUuid,
                optionUuid,
                data: req.body,
            });

            logWithContext("info", "[ProductOption] Option updated", {
                traceId,
                optionUuid,
            });

            return res.status(200).json({
                success: true,
                option,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to update option", {
                traceId,
                error: error.message,
            });

            if (error.code === "P2025") {
                return res.status(404).json({
                    error: "OPTION_NOT_FOUND",
                    message: "Option not found",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to update option",
            });
        }
    }

    //DELETE /api/options/:optionUuid
    static async deleteOption(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `opt_${Date.now()}`;
        
        try {
            const tenantUuid = req.tenant!.uuid;
            const { optionUuid } = req.params;

            await ProductOptionService.deleteOption({
                tenantUuid,
                optionUuid,
            });

            logWithContext("info", "[ProductOption] Option deleted", {
                traceId,
                optionUuid,
            });

            return res.status(204).send();

        } catch (error: any) {
            logWithContext("error", "[ProductOption] Failed to delete option", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete option",
            });
        }
    }
}