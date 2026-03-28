import { Request, Response } from "express";
import dayjs from "dayjs";
import { TenantAnalyticsService } from "../../services/tenant/tenantAnalytic.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";


export class TenantAnalyticsController {
  static async getRevenueTrend(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const { storeUuid, granularity } = req.query;
      const from = req.query.from
        ? new Date(req.query.from as string)
        : dayjs().subtract(30, "day").toDate();
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
 
      const data = await TenantAnalyticsService.getRevenueTrend({
        tenantUuid,
        storeUuid: storeUuid as string,
        from,
        to,
        granularity: granularity as any,
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      logWithContext("error", "[Analytics] Revenue trend failed", { error: error.message });
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
 
  static async getPaymentMethods(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const { storeUuid } = req.query;
      const from = req.query.from
        ? new Date(req.query.from as string)
        : dayjs().subtract(30, "day").toDate();
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
 
      const data = await TenantAnalyticsService.getPaymentMethodBreakdown({
        tenantUuid,
        storeUuid: storeUuid as string,
        from,
        to,
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
 
  static async getPeakHours(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const { storeUuid } = req.query;
      const days = parseInt(req.query.days as string) || 30;
 
      const data = await TenantAnalyticsService.getPeakHoursAnalysis(
        tenantUuid,
        storeUuid as string,
        days
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
 
  static async getDayOfWeek(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const { storeUuid } = req.query;
      const days = parseInt(req.query.days as string) || 90;
 
      const data = await TenantAnalyticsService.getDayOfWeekAnalysis(
        tenantUuid,
        storeUuid as string,
        days
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
 
  static async getStoreComparison(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const days = parseInt(req.query.days as string) || 30;
 
      const data = await TenantAnalyticsService.getStoreComparison(tenantUuid, days);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
 
  static async getCustomerAnalytics(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const days = parseInt(req.query.days as string) || 30;
 
      const data = await TenantAnalyticsService.getCustomerAnalytics(tenantUuid, days);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
    }
  }
}