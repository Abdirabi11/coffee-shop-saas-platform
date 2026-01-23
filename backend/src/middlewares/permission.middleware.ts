import type { Request, Response, NextFunction } from "express";
import { hasPermission } from "../services/persmission.service.ts";

export const requirePermission= (permissionKey: string)=>{
    return async (req: Request, res: Response, next: NextFunction)=>{
        const role= req.user?.role;
        if (!role) {
            return res.status(403).json({ message: "Role missing" });
        };

        if (!req.user) {
            return res.status(401).json({ message: "Unauthenticated" });
        }

        const allowed= await hasPermission(role, permissionKey);
        if (!allowed) {
            return res.status(403).json({
              message: "Insufficient permissions",
            });
        };
        next()
    }
};