import type { Request, Response } from "express"
import { StoreDashboardService } from "../../services/store/storeDashboard.service.ts";
import { AuthRequest } from "../../types/auth.types.ts";


export const getStoreDashboard = async (req: AuthRequest, res: Response) => {
    const storeUuid = req.user!.storeUuid;
    const data = await StoreDashboardService.getDashboard(storeUuid);
    res.json({ success: true, data });
  };
  
  export const activeOrders = async (req: AuthRequest, res: Response) => {
    const storeUuid = req.user!.storeUuid;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
  
    const data = await StoreDashboardService.getActiveOrders(
      storeUuid,
      page,
      limit
    );
  
    res.json({ success: true, ...data });
  };
  
  export const peakHours = async (req: AuthRequest, res: Response) => {
    const storeUuid = req.user!.storeUuid;
    const data = await StoreDashboardService.getPeakHours(storeUuid);
    res.json({ success: true, data });
  };