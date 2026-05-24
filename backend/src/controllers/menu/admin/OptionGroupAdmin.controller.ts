import type { Request, Response } from "express";
import { OptionGroupAdminService } from "../../../services/menu/OptionGroupAdmin.service.ts";


export class OptionGroupAdminController {

    static async createOptionGroup(req: Request, res: Response) {
        try {
            const optionGroup = await OptionGroupAdminService.createOptionGroup({
                tenantUuid: req.tenant!.uuid,
                ...req.body,
            });
            return res.status(201).json({ success: true, optionGroup });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to create option group" });
        }
    }

    static async addOption(req: Request, res: Response) {
        try {
            const option = await OptionGroupAdminService.addOption({
                groupUuid: req.params.groupUuid,
                tenantUuid: req.tenant!.uuid, 
                ...req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, option });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to add option" });
        }
    }

    static async linkToProduct(req: Request, res: Response) {
        try {
            const link = await OptionGroupAdminService.linkToProduct({
                productUuid: req.params.productUuid,
                groupUuid: req.params.groupUuid,
                ...req.body,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(201).json({ success: true, link });
        } catch (error: any) {
            if (error.code === "P2002") {
                return res.status(400).json({ error: "ALREADY_LINKED", message: "This option group is already linked to this product" });
            }
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to link option group" });
        }
    }

    static async unlinkFromProduct(req: Request, res: Response) {
        try {
            await OptionGroupAdminService.unlinkFromProduct({
                productUuid: req.params.productUuid,
                groupUuid: req.params.groupUuid,
                triggeredBy: req.user!.userUuid,
            });
            return res.status(200).json({ success: true, message: "Option group unlinked successfully" });
        } catch (error: any) {
            return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to unlink option group" });
        }
    }
}