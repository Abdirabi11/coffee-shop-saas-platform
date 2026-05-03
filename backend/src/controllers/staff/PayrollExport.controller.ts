import type { Request, Response } from "express";
import { PayrollExportService } from "../../services/staff/PayrollExport.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
export class PayrollExportController {

    static async calculatePayroll(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, periodStart, periodEnd, periodType } = req.body;

            if (!periodStart || !periodEnd) {
                return res.status(400).json({ success: false, error: "PERIOD_REQUIRED" });
            }

            const result = await PayrollExportService.calculatePayrollPeriod({
                tenantUuid,
                storeUuid,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                periodType,
            });

            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            logWithContext("error", "[Payroll] Calculate failed", { error: error.message });
            return res.status(500).json({ success: false, error: "CALCULATION_FAILED" });
        }
    }

    static async approvePayroll(req: Request, res: Response) {
        try {
            const { payrollPeriodUuid } = req.params;
            const user = (req as any).user;

            const result = await PayrollExportService.approvePayrollPeriod({
                payrollPeriodUuid,
                approvedBy: user.userUuid,
            });

            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "APPROVE_FAILED" });
        }
    }

    static async exportPayroll(req: Request, res: Response) {
        try {
            const { payrollPeriodUuid } = req.params;
            const { format } = req.body;
            const user = (req as any).user;

            if (!format) {
                return res.status(400).json({ success: false, error: "FORMAT_REQUIRED" });
            }

            const result = await PayrollExportService.exportPayroll({
                payrollPeriodUuid,
                format,
                exportedBy: user.userUuid,
            });

            if (format === "EXCEL") {
                res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
                return res.send(result.fileContent);
            }

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
            return res.send(result.fileContent);
        } catch (error: any) {
            logWithContext("error", "[Payroll] Export failed", { error: error.message });
            return res.status(500).json({ success: false, error: "EXPORT_FAILED" });
        }
    }
}