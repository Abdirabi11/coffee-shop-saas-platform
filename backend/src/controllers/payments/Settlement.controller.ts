import { Request, Response } from "express";
import { SettlementService } from "../../services/payment/Settlement.service.ts";

export class SettlementController {
    // GET /api/v1/settlements/dashboard
    static async getDashboard(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const data = await SettlementService.getDashboard(tenantUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/settlements/history?provider=&status=&from=&to=&limit=&offset=
    static async getHistory(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { provider, status, from, to, limit, offset } = req.query;
        
            const data = await SettlementService.getHistory({
                tenantUuid,
                provider: provider as string,
                status: status as string,
                from: from ? new Date(from as string) : undefined,
                to: to ? new Date(to as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/settlements/pending
    static async getPending(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const data = await SettlementService.getHistory({
                tenantUuid,
                status: "PENDING",
                limit: 50,
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}