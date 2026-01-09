import type { Request, Response } from "express"
import { TenantDashboardService } from "../../services/Tenant/tenantDashboard.service.ts";
import { AuthRequest } from "../../types/auth.types.ts";
import prisma from "../config/prisma.ts"

export const getTenantDashboard = async (req: AuthRequest, res: Response) => {
    const tenantUuid = req.user!.tenantUuid;
    const data = await TenantDashboardService.getDashboard(tenantUuid);
    res.json({ success: true, data });
  };

export const getDashboard = async (req: AuthRequest, res: Response) => {
    const tenantUuid = req.user!.tenantUuid;
  
    const data = await DashboardService.getTenantDashboard(tenantUuid);
  
    res.json({ success: true, data });
};

export const activeOrders= async (req: Request, res: Response)=>{
    try {
        const orders= await prisma.order.findMany({
            where: { 
                status: "IN_PROGRESS",
                storeUuid: req.user!.storeUuid,
            },
        })
        res.json({ orders });
    } catch (err) {
        console.error("Error in get admin active orders:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getRevenue= async (req: Request, res: Response)=>{
    try {
        const revenue= await prisma.order.aggregate({
            _sum: { totalPrice: true },
            where: { 
                status: "COMPLETED",
                storeUuid: req.user!.storeUuid,
            },
        });
        res.json({ revenue: revenue._sum.totalPrice || 0 });
    } catch (err) {
        console.error("Error in admin get revenue:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const peakHours= async (req: Request, res: Response)=>{
    try {
        const data= await prisma.order.groupBy({
            by: ["createdAt"],
            where: {
                storeUuid: req.user!.storeUuid,
            },
            _count: true,
        });
        res.json({ data });
    } catch (err) {
        console.error("Error in admin get peak hours:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
