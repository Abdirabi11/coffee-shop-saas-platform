import type { Request, Response } from "express"
import { RevenueForecastService } from "../../services/Dashboards/RevenueForecast.service.ts";

export class RevenueForecastController {
    // GET /api/v1/forecast/projection?period=month&storeUuid=
    static async getProjection(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { period, storeUuid } = req.query;
        
            const data = await RevenueForecastService.getCurrentPeriodProjection({
                tenantUuid,
                storeUuid: storeUuid as string,
                period: (period as "month" | "week") || "month",
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/forecast/yoy?period=month&storeUuid=
    static async getYearOverYear(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { period, storeUuid } = req.query;
        
            const data = await RevenueForecastService.getYearOverYearComparison({
                tenantUuid,
                storeUuid: storeUuid as string,
                period: (period as "day" | "week" | "month") || "month",
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/forecast/velocity?storeUuid=
    static async getVelocity(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { storeUuid } = req.query;
        
            const data = await RevenueForecastService.getTrendVelocity({
                tenantUuid,
                storeUuid: storeUuid as string,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/forecast/summary?storeUuid=
    static async getSummary(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { storeUuid } = req.query;
        
            const data = await RevenueForecastService.getForecastSummary({
                tenantUuid,
                storeUuid: storeUuid as string,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}