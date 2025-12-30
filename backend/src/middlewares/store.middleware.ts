import type { Request, Response, NextFunction } from "express";


export const requireAccessStore= async (req: Request, res: Response, next: NextFunction)=>{
    if(!req.user?.StoreUuid){
        return res.status(403).json({ message: "Store context required" });
    }

    next()
};