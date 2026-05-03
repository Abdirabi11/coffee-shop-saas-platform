import type { Request, Response } from "express";
import prisma from "../../../config/prisma.ts"
import { logWithContext } from "../../../infrastructure/observability/Logger.ts";
import { MenuCacheService } from "../../../services/menu/menuCache.service.ts";


export class OptionGroupAdminController {
    //POST /api/admin/menu/option-groups
    static async createOptionGroup(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuid,
                name,
                description,
                selectionType,
                minSelections,
                maxSelections,
                isRequired,
            } = req.body;

            const optionGroup = await prisma.optionGroup.create({
                data: {
                tenantUuid,
                storeUuid,
                name,
                description,
                selectionType,
                minSelections,
                maxSelections,
                isRequired,
                },
            });

            logWithContext("info", "[OptionGroupAdmin] Option group created", {
                optionGroupUuid: optionGroup.uuid,
                name: optionGroup.name,
            });

            return res.status(201).json({
                success: true,
                optionGroup,
            });

        } catch (error: any) {
            logWithContext("error", "[OptionGroupAdmin] Create failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to create option group",
            });
        }
    }

    //POST /api/admin/menu/option-groups/:groupUuid/options
    static async addOption(req: Request, res: Response) {
        try {
            const { groupUuid } = req.params;
            const { name, description, extraCost, trackInventory, currentStock } = req.body;

            const option = await prisma.option.create({
                data: {
                optionGroupUuid: groupUuid,
                name,
                description,
                extraCost,
                trackInventory,
                currentStock,
                },
            });

            // Get option group to invalidate cache
            const optionGroup = await prisma.optionGroup.findUnique({
                where: { uuid: groupUuid },
            });

            if (optionGroup) {
                await MenuCacheService.invalidate({
                    tenantUuid: optionGroup.tenantUuid,
                    storeUuid: optionGroup.storeUuid,
                    reason: "OPTION_ADDED",
                    triggeredBy: req.user!.uuid,
                });
            }

            logWithContext("info", "[OptionGroupAdmin] Option added", {
                optionUuid: option.uuid,
                name: option.name,
            });

            return res.status(201).json({
                success: true,
                option,
            });

        } catch (error: any) {
            logWithContext("error", "[OptionGroupAdmin] Add option failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to add option",
            });
        }
    }

    //POST /api/admin/menu/products/:productUuid/option-groups/:groupUuid
    static async linkToProduct(req: Request, res: Response) {
        try {
            const { productUuid, groupUuid } = req.params;
            const { minSelections, maxSelections, isRequired, order } = req.body;

            const link = await prisma.productOptionGroup.create({
                data: {
                    productUuid,
                    optionGroupUuid: groupUuid,
                    minSelections,
                    maxSelections,
                    isRequired,
                    order,
                },
            });

            // Get product to invalidate cache
            const product = await prisma.product.findUnique({
                where: { uuid: productUuid },
            });

            if (product) {
                await MenuCacheService.invalidate({
                    tenantUuid: product.tenantUuid,
                    storeUuid: product.storeUuid,
                    reason: "PRODUCT_UPDATED",
                    triggeredBy: req.user!.uuid,
                });
            }

            logWithContext("info", "[OptionGroupAdmin] Linked to product", {
                productUuid,
                groupUuid,
            });

            return res.status(201).json({
                success: true,
                link,
            });

        } catch (error: any) {
            logWithContext("error", "[OptionGroupAdmin] Link failed", {
                error: error.message,
            });

            if (error.code === "P2002") {
                return res.status(400).json({
                error: "ALREADY_LINKED",
                message: "This option group is already linked to this product",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to link option group",
            });
        }
    }

    //DELETE /api/admin/menu/products/:productUuid/option-groups/:groupUuid
    static async unlinkFromProduct(req: Request, res: Response) {
        try {
            const { productUuid, groupUuid } = req.params;

            await prisma.productOptionGroup.delete({
                where: {
                    productUuid_optionGroupUuid: {
                        productUuid,
                        optionGroupUuid: groupUuid,
                    },
                },
            });

            // Get product to invalidate cache
            const product = await prisma.product.findUnique({
                where: { uuid: productUuid },
            });

            if (product) {
                await MenuCacheService.invalidate({
                    tenantUuid: product.tenantUuid,
                    storeUuid: product.storeUuid,
                    reason: "PRODUCT_UPDATED",
                    triggeredBy: req.user!.uuid,
                });
            }

            logWithContext("info", "[OptionGroupAdmin] Unlinked from product", {
                productUuid,
                groupUuid,
            });

            return res.status(200).json({
                success: true,
                message: "Option group unlinked successfully",
            });

        } catch (error: any) {
            logWithContext("error", "[OptionGroupAdmin] Unlink failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to unlink option group",
            });
        }
    }
}