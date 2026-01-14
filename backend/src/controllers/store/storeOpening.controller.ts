import type { Request, Response } from "express"
import { StoreOpeningService } from "../../services/store/store-opening.service.js"

export const setOpeningHour= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid 
        const opening= await StoreOpeningService.set(storeUuid, req.body);
        res.json(opening);
    } catch (err) {
        console.error("SET_OPENING_HOUR", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getOpeningHours= async (req: Request, res: Response)=>{
    try {
        const storeUuid= req.store!.uuid
        const data = await StoreOpeningService.list(storeUuid);
        res.json(data);
    } catch (err) {
        console.error("GET_OPENING_HOURS", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
