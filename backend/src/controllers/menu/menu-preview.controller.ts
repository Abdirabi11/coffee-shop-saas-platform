import { Request, Response } from "express";
import { MenuPreviewService } from "../../services/menu/menu-preview.service.ts";


export const  getMenuPreview = async (req: Request, res: Response) => {
    const { storeUuid } = req.params;
    const preview = await MenuPreviewService.getStoreMenuPreview(storeUuid);
    res.json(preview);
}