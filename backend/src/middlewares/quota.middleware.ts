import type { Request, Response, NextFunction } from "express";
import { checkTenantQuota } from "../services/quota.service.ts";

export const tenantQuotaGuard= async (
    scope: "DASHBOARD" | "REPORTS" | "EXPORTS"
)=>{
    async (req: Request, res: Response, next: NextFunction)=>{
        const { tenantUuid, role } = req.user || {};
        if (!tenantUuid) {
            return res.status(400).json({ message: "Tenant not resolved" });
        };

        if (role === "SUPER_ADMIN") return next();

        const result= await checkTenantQuota(tenantUuid, scope);

        if (!result.allowed) {
            return res.status(429).json({
            message: "Tenant quota exceeded",
            resetInSeconds: result.resetIn,
            });
        };
        
        next()
    };
};