import { Request, Response } from "express";
import { StaffDashboardService } from "../../services/Dashboards/CashierDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class StaffDashboardController {
  static async getDashboard(req: Request, res: Response) {
    try {
      // Verified tenant and store (requireTenantContext, checkRole), and the
      // caller's own user: never a tenant or user taken from the URL
      const tenantUuid = req.tenant!.uuid;
      const userUuid = req.user!.userUuid;
      const storeUuid = req.store!.uuid;
 
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