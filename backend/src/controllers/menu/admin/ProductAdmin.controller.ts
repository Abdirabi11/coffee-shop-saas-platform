import type { Request, Response } from "express";
import { planLimitErrorResponse } from "../../../services/billing/PlanLimit.service.ts";
import { ProductAdminService } from "../../../services/products/ProductAdmin.service.ts";


export class ProductAdminController {

    static async createProduct(req: Request, res: Response) {
        try {
            // Verified tenant last, so nothing in the body can replace it
            const product = await ProductAdminService.createProduct({
                ...req.body,
                tenantUuid: req.tenant!.uuid,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, product });
        } catch (error: any) {
            if (error.message === "CATEGORY_NOT_IN_STORE") {
                return res.status(400).json({ error: "CATEGORY_NOT_IN_STORE", message: "Category does not belong to this store" });
            }
            if (error.code === "P2002") {
                return res.status(400).json({ error: "DUPLICATE_PRODUCT", message: "A product with this name already exists in this category" });
            }
            const limited = planLimitErrorResponse(res, error);
            if (limited) return limited;
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to create product" });
        }
    }

    static async updateProduct(req: Request, res: Response) {
        try {
            const product = await ProductAdminService.updateProduct({
                tenantUuid: req.tenant!.uuid,
                productUuid: req.params.productUuid,
                updateData: req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, product });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({ error: "PRODUCT_NOT_FOUND", message: "Product not found" });
            }
            if (error.message === "CATEGORY_NOT_IN_STORE") {
                return res.status(400).json({ error: "CATEGORY_NOT_IN_STORE", message: "Category does not belong to this store" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to update product" });
        }
    }

    static async deleteProduct(req: Request, res: Response) {
        try {
            await ProductAdminService.deleteProduct({
                tenantUuid: req.tenant!.uuid,
                productUuid: req.params.productUuid,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Product deleted successfully" });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({ error: "PRODUCT_NOT_FOUND", message: "Product not found" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to delete product" });
        }
    }

    static async bulkUpdatePrices(req: Request, res: Response) {
        try {
            const data = await ProductAdminService.bulkUpdatePrices({
                tenantUuid: req.tenant!.uuid,
                storeUuid: req.body.storeUuid,
                updates: req.body.updates,
                reason: req.body.reason,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, ...data });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to update prices" });
        }
    }

    static async bulkUpdateAvailability(req: Request, res: Response) {
        try {
            const data = await ProductAdminService.bulkUpdateAvailability({
                tenantUuid: req.tenant!.uuid,
                storeUuid: req.body.storeUuid,
                productUuids: req.body.productUuids,
                isAvailable: req.body.isAvailable,
                reason: req.body.reason,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, ...data });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to update availability" });
        }
    }
}