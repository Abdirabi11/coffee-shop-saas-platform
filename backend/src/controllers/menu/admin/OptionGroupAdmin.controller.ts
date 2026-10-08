import type { Request, Response } from "express";
import { OptionGroupAdminService } from "../../../services/menu/OptionGroupAdmin.service.ts";


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
                groupUuid: req.params.groupUuid,
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
                productUuid: req.params.productUuid,
                groupUuid: req.params.groupUuid,
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
                productUuid: req.params.productUuid,
                groupUuid: req.params.groupUuid,
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
}