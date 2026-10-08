import type { Request, Response } from "express";
import { PayrollExportService } from "../../services/staff/PayrollExport.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

const PAYROLL_ERRORS: Record<string, number> = {
    UNSUPPORTED_FORMAT: 400,
    PAYROLL_PERIOD_NOT_FOUND: 404,
    PAYROLL_NOT_CALCULATED: 409,
    PAYROLL_NOT_APPROVED: 409,
    PAYROLL_PERIOD_LOCKED: 409,
    PAYROLL_PERIOD_SCOPE_MISMATCH: 409,
};

function payrollError(res: Response, error: any, fallback: string) {
    const status = PAYROLL_ERRORS[error.message];
    if (status) return res.status(status).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: fallback });
}
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
            return payrollError(res, error, "CALCULATION_FAILED");
        }
    }

    static async approvePayroll(req: Request, res: Response) {
        try {
            const { payrollPeriodUuid } = req.params;
            const user = (req as any).user;

            const result = await PayrollExportService.approvePayrollPeriod({
                tenantUuid: req.tenant!.uuid,
                payrollPeriodUuid,
                approvedBy: user.userUuid,
            });

            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return payrollError(res, error, "APPROVE_FAILED");
        }
    }

    static async exportPayroll(req: Request, res: Response) {
        try {
            const { payrollPeriodUuid } = req.params;
            const { format } = req.body ?? {};
            const user = (req as any).user;

            if (!format) {
                return res.status(400).json({ success: false, error: "FORMAT_REQUIRED" });
            }

            const result = await PayrollExportService.exportPayroll({
                tenantUuid: req.tenant!.uuid,
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
            return payrollError(res, error, "EXPORT_FAILED");
        }
    }
}