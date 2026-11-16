import type { Request, Response } from "express";
import { logWithContext } from "../../../infrastructure/observability/Logger.ts";
import { MenuScheduleService } from "../../../services/menu/MenuSchedule.service.ts";

function serverError(res: Response, error: any, action: string) {
    logWithContext("error", `[MenuSchedule] ${action} failed`, { error: error.message });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: `Failed to ${action}` });
}

export class MenuScheduleController {
    // PUT /api/admin/menu/categories/:categoryUuid/availability
    // { availableDays?, timeSlots?, availableFrom?, availableUntil? } replaces the schedule
    static async setCategorySchedule(req: Request, res: Response) {
        try {
            const category = await MenuScheduleService.setCategorySchedule({
                tenantUuid: req.tenant!.uuid,
                categoryUuid: String(req.params.categoryUuid),
                schedule: req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, category });
        } catch (error: any) {
            if (error.message === "CATEGORY_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Category not found" });
            }
            return serverError(res, error, "set category schedule");
        }
    }

    // PUT /api/admin/menu/products/:productUuid/availability
    static async setProductSchedule(req: Request, res: Response) {
        try {
            const product = await MenuScheduleService.setProductSchedule({
                tenantUuid: req.tenant!.uuid,
                productUuid: String(req.params.productUuid),
                schedule: req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, product });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Product not found" });
            }
            return serverError(res, error, "set product schedule");
        }
    }

    // POST /api/admin/menu/categories/reorder  { storeUuid, categoryUuids }
    static async reorderCategories(req: Request, res: Response) {
        try {
            const order = await MenuScheduleService.reorderCategories({
                tenantUuid: req.tenant!.uuid,
                storeUuid: req.body.storeUuid,
                categoryUuids: req.body.categoryUuids,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, order });
        } catch (error: any) {
            if (error.message === "DUPLICATE_CATEGORY_IN_ORDER") {
                return res.status(400).json({ error: error.message, message: "A category appears more than once" });
            }
            if (error.message === "CATEGORY_ORDER_MISMATCH") {
                return res.status(400).json({
                    error: error.message,
                    message: "categoryUuids must list every category of the store exactly once",
                    ...error.details,
                });
            }
            return serverError(res, error, "reorder categories");
        }
    }
}
