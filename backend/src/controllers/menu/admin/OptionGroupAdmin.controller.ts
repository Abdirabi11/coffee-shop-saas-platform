import type { Request, Response } from "express";
import { OptionGroupAdminService } from "../../../services/menu/OptionGroupAdmin.service.ts";
import { logWithContext } from "../../../infrastructure/observability/Logger.ts";

function serverError(res: Response, error: any, action: string) {
    logWithContext("error", `[OptionGroupAdmin] ${action} failed`, { error: error.message });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: `Failed to ${action}` });
}


export class OptionGroupAdminController {

    static async createOptionGroup(req: Request, res: Response) {
        try {
            const optionGroup = await OptionGroupAdminService.createOptionGroup({
                ...req.body,
                tenantUuid: req.tenant!.uuid,
            });
            return res.status(201).json({ success: true, optionGroup });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to create option group" });
        }
    }

    static async addOption(req: Request, res: Response) {
        try {
            // Route params and the verified tenant last: the body can't redirect them
            const option = await OptionGroupAdminService.addOption({
                ...req.body,
                groupUuid: String(req.params.groupUuid),
                tenantUuid: req.tenant!.uuid,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, option });
        } catch (error: any) {
            if (error.message === "OPTION_GROUP_NOT_FOUND") {
                return res.status(404).json({ error: "OPTION_GROUP_NOT_FOUND", message: "Option group not found" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to add option" });
        }
    }

    static async linkToProduct(req: Request, res: Response) {
        try {
            // Route params and the verified tenant last: the body used to be able
            // to swap in another tenant's productUuid after the permission check
            const { required, multiSelect, displayOrder, description } = req.body ?? {};
            const link = await OptionGroupAdminService.linkToProduct({
                required,
                multiSelect,
                displayOrder,
                description,
                tenantUuid: req.tenant!.uuid,
                productUuid: String(req.params.productUuid),
                groupUuid: String(req.params.groupUuid),
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, link });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND" || error.message === "OPTION_GROUP_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Not found" });
            }
            if (error.message === "OPTION_GROUP_STORE_MISMATCH") {
                return res.status(400).json({ error: error.message, message: "Option group belongs to a different store" });
            }
            if (error.code === "P2002") {
                return res.status(400).json({ error: "ALREADY_LINKED", message: "This option group is already linked to this product" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to link option group" });
        }
    }

    static async unlinkFromProduct(req: Request, res: Response) {
        try {
            await OptionGroupAdminService.unlinkFromProduct({
                tenantUuid: req.tenant!.uuid,
                productUuid: String(req.params.productUuid),
                groupUuid: String(req.params.groupUuid),
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Option group unlinked successfully" });
        } catch (error: any) {
            if (error.message === "PRODUCT_NOT_FOUND" || error.code === "NOT_FOUND") {
                return res.status(404).json({ error: "NOT_FOUND", message: "Link not found" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to unlink option group" });
        }
    }

    // GET /api/admin/menu/option-groups/store/:storeUuid
    static async listOptionGroups(req: Request, res: Response) {
        try {
            const optionGroups = await OptionGroupAdminService.listOptionGroups(req.tenant!.uuid, String(req.params.storeUuid));
            return res.status(200).json({ success: true, optionGroups });
        } catch (error: any) {
            return serverError(res, error, "list option groups");
        }
    }

    // PATCH /api/admin/menu/option-groups/:groupUuid
    static async updateOptionGroup(req: Request, res: Response) {
        try {
            const optionGroup = await OptionGroupAdminService.updateOptionGroup({
                tenantUuid: req.tenant!.uuid,
                groupUuid: String(req.params.groupUuid),
                triggeredBy: req.user!.userUuid,
                data: req.body,
            });
            return res.status(200).json({ success: true, optionGroup });
        } catch (error: any) {
            if (error.message === "OPTION_GROUP_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Option group not found" });
            }
            if (error.message === "INVALID_SELECTION_RANGE") {
                return res.status(400).json({ error: error.message, message: "minSelections can't exceed maxSelections" });
            }
            return serverError(res, error, "update option group");
        }
    }

    // DELETE /api/admin/menu/option-groups/:groupUuid (deactivates)
    static async deleteOptionGroup(req: Request, res: Response) {
        try {
            await OptionGroupAdminService.deleteOptionGroup({
                tenantUuid: req.tenant!.uuid,
                groupUuid: String(req.params.groupUuid),
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Option group deactivated" });
        } catch (error: any) {
            if (error.message === "OPTION_GROUP_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Option group not found" });
            }
            return serverError(res, error, "delete option group");
        }
    }

    // PATCH /api/admin/menu/options/:optionUuid
    static async updateOption(req: Request, res: Response) {
        try {
            const option = await OptionGroupAdminService.updateOption({
                tenantUuid: req.tenant!.uuid,
                optionUuid: String(req.params.optionUuid),
                triggeredBy: req.user!.userUuid,
                data: req.body,
            });
            return res.status(200).json({ success: true, option });
        } catch (error: any) {
            if (error.message === "OPTION_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Option not found" });
            }
            return serverError(res, error, "update option");
        }
    }

    // DELETE /api/admin/menu/options/:optionUuid (deactivates)
    static async deleteOption(req: Request, res: Response) {
        try {
            await OptionGroupAdminService.deleteOption({
                tenantUuid: req.tenant!.uuid,
                optionUuid: String(req.params.optionUuid),
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Option deactivated" });
        } catch (error: any) {
            if (error.message === "OPTION_NOT_FOUND") {
                return res.status(404).json({ error: error.message, message: "Option not found" });
            }
            return serverError(res, error, "delete option");
        }
    }
}
