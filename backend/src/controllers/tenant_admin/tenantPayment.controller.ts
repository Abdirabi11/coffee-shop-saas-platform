import type { Request, Response } from "express"
import prisma from "../config/prisma.ts"

export const failedPayments= async (_req: Request, res: Response)=>{
    try {
        const payments = await prisma.order.findMany({
            where: { paymentStatus: "FAILED" },
        });
        
        res.json({ payments });
    } catch (err) {
        console.error("Error in admin get failed payments:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
