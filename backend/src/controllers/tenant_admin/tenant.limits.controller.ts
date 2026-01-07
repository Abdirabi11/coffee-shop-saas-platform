import { Request, Response } from "express";
import { resolveTenantLimits } from "../../services/plan.service";


//GET /tenant/limits
export const getTenantLimits= async(req: Request, res: Response)=>{
    const tenantUuid= req.user.storeUuid;
    
    const limits= await resolveTenantLimits(tenantUuid);
    res.json(limits)
};