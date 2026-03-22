import { Request, Response } from "express";
import { TaxTrackingService } from "../../services/Dashboards/TaxTracking.service.js";
import { logWithContext } from "../../infrastructure/observability/logger.js";

export class TaxTrackingController {
  // GET /api/v1/tax/summary?from=&to=&storeUuid=
  static async getSummary(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const { from, to, storeUuid } = req.query;
 
      if (!from || !to) {
        return res.status(400).json({ success: false, error: "from and to are required" });
      }
 
      const data = await TaxTrackingService.getTaxSummary({
        tenantUuid,
        storeUuid: storeUuid as string,
        from: new Date(from as string),
        to: new Date(to as string),
      });
 
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      logWithContext("error", "[TaxCtrl] getSummary failed", { error: error.message });
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // GET /api/v1/tax/monthly?year=2025
  static async getMonthlyTrend(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const year = parseInt(req.query.year as string) || undefined;
 
      const data = await TaxTrackingService.getMonthlyTrend(tenantUuid, year);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      logWithContext("error", "[TaxCtrl] getMonthlyTrend failed", { error: error.message });
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // GET /api/v1/tax/by-method?from=&to=
  static async getByPaymentMethod(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const { from, to, storeUuid } = req.query;
 
      if (!from || !to) {
        return res.status(400).json({ success: false, error: "from and to are required" });
      }
 
      const data = await TaxTrackingService.getTaxByPaymentMethod({
        tenantUuid,
        storeUuid: storeUuid as string,
        from: new Date(from as string),
        to: new Date(to as string),
      });
 
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
 
  // GET /api/v1/tax/liability?from=&to=
  static async getNetLiability(req: Request, res: Response) {
    try {
      const tenantUuid = (req as any).user?.tenantUuid;
      const { from, to, storeUuid } = req.query;
 
      if (!from || !to) {
        return res.status(400).json({ success: false, error: "from and to are required" });
      }
 
      const data = await TaxTrackingService.getNetTaxLiability({
        tenantUuid,
        storeUuid: storeUuid as string,
        from: new Date(from as string),
        to: new Date(to as string),
      });
 
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "FETCH_FAILED" });
    }
  }
}