import { Request, Response } from "express";
import dayjs from "dayjs";
import { DashboardExportService } from "../../services/export/DashboardExport.service.ts";

export class DashboardExportController {
  
    static async exportSuperAdminCSV(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;

            const csv = await DashboardExportService.exportSuperAdminCSV({
                dateFrom: dateFrom ? new Date(dateFrom as string) : dayjs().subtract(30, "day").toDate(),
                dateTo: dateTo ? new Date(dateTo as string) : new Date(),
            });

            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="dashboard-${Date.now()}.csv"`
            );

            return res.send(csv);

        } catch (error: any) {
            return res.status(500).json({
                error: "EXPORT_FAILED",
                message: "Failed to export dashboard",
            });
        }
    }

    static async exportTenantExcel(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;

            const buffer = await DashboardExportService.exportTenantExcel({
                tenantUuid,
                dateFrom: dateFrom ? new Date(dateFrom as string) : dayjs().subtract(30, "day").toDate(),
                dateTo: dateTo ? new Date(dateTo as string) : new Date(),
            });

            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="dashboard-${Date.now()}.xlsx"`
            );

            return res.send(buffer);

        } catch (error: any) {
            return res.status(500).json({
                error: "EXPORT_FAILED",
                message: "Failed to export dashboard",
            });
        }
    }
}