import { DashboardService } from "../services/dashboard.service.ts";


export async function prewarmDashboards() {
    await Promise.all([
      DashboardService.getAdminOverview({}),
      DashboardService.getPlatformHealth(),
    ]);
};