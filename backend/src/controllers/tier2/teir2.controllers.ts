  

 
// ════════════════════════════════════════════════════════════════════════════
// 2. FINANCIAL REPORT CONTROLLER — 3 endpoints (downloadable files)
// ════════════════════════════════════════════════════════════════════════════
 

 
// ════════════════════════════════════════════════════════════════════════════
// 3. REVENUE FORECAST CONTROLLER — 4 endpoints
// ════════════════════════════════════════════════════════════════════════════
 
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
 
// ════════════════════════════════════════════════════════════════════════════
// 4. SETTLEMENT CONTROLLER — 3 endpoints
// ════════════════════════════════════════════════════════════════════════════
 
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