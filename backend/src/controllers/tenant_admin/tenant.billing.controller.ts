import { Request, Response } from "express";
import { calculateMonthlyBill } from "../../services/plan.services.ts"

//GET /tenant/billing/monthly
export const getMonthlyBill= async (req: Request, res: Response)=>{
    const tenantUuid= req.user.storeUuid;
    const bill= await calculateMonthlyBill(tenantUuid);

    res.json(bill);
};


