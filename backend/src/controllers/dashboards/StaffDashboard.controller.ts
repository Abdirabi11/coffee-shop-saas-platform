import { Request, Response } from "express";
import { StaffDashboardService } from "../../services/Dashboards/CashierDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class StaffDashboardController {
  static async getDashboard(req: Request, res: Response) {
    try {
      const tenantUuid = req.params.tenantUuid || (req as any).tenantUuid;
      const userUuid = (req as any).userUuid; // From JWT
      const { storeUuid } = req.params;
 
      if (!storeUuid) {
        return res.status(400).json({ success: false, error: "STORE_UUID_REQUIRED" });
      }
 
      const data = await StaffDashboardService.getDashboard(
        tenantUuid,
        userUuid,
        storeUuid
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      if (error.message === "STAFF_NOT_FOUND") {
        return res.status(404).json({ success: false, error: "STAFF_NOT_FOUND" });
      }
      logWithContext("error", "[StaffDashboard] Failed", { error: error.message });
      return res.status(500).json({ success: false, error: "DASHBOARD_FETCH_FAILED" });
    }
  }
}