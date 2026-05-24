import type { Request, Response } from "express";
import { ProductAdminService } from "../../../services/products/ProductAdmin.service.ts";


export class ProductAdminController {

    static async createProduct(req: Request, res: Response) {
        try {
            const product = await ProductAdminService.createProduct({
                tenantUuid: req.tenant!.uuid,
                ...req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, product });
        } catch (error: any) {
            if (error.code === "P2002") {
                return res.status(400).json({ error: "DUPLICATE_PRODUCT", message: "A product with this name already exists in this category" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to create product" });
        }
    }

    static async updateProduct(req: Request, res: Response) {
        try {
            const product = await ProductAdminService.updateProduct({
                productUuid: req.params.productUuid,
                updateData: req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, product });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({ error: "PRODUCT_NOT_FOUND", message: "Product not found" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to update product" });
        }
    }

    static async deleteProduct(req: Request, res: Response) {
        try {
            await ProductAdminService.deleteProduct({
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