import type { Request, Response } from "express";
import { CategoryAdminService } from "../../../services/category/CategoryAdmin.service.ts";


export class CategoryAdminController {

    static async getCategories(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const categories = await CategoryAdminService.getCategories(storeUuid);
            return res.status(200).json({ success: true, categories });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to retrieve categories" });
        }
    }

    static async createCategory(req: Request, res: Response) {
        try {
            const category = await CategoryAdminService.createCategory({
                tenantUuid: req.tenant!.uuid,
                ...req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, category });
        } catch (error: any) {
            if (error.code === "P2002") {
                return res.status(400).json({ error: "DUPLICATE_CATEGORY", message: "A category with this name already exists" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to create category" });
        }
    }

    static async updateCategory(req: Request, res: Response) {
        try {
            const category = await CategoryAdminService.updateCategory({
                categoryUuid: req.params.categoryUuid,
                updateData: req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, category });
        } catch (error: any) {
            if (error.message === "CATEGORY_NOT_FOUND") {
                return res.status(404).json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to update category" });
        }
    }

    static async deleteCategory(req: Request, res: Response) {
        try {
            await CategoryAdminService.deleteCategory({
                categoryUuid: req.params.categoryUuid,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Category deleted successfully" });
        } catch (error: any) {
            if (error.message === "CATEGORY_NOT_FOUND") {
                return res.status(404).json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
            }
            if (error.message === "CATEGORY_HAS_PRODUCTS") {
                return res.status(400).json({ error: "CATEGORY_HAS_PRODUCTS", message: "Cannot delete category with products" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to delete category" });
        }
    }
}