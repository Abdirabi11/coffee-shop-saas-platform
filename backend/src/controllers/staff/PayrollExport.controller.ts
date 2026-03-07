import prisma from "../../config/prisma.ts"
import { PayrollExportService } from "../../services/staff/PayrollExport.service.ts";

export class PayrollExportController{
    //POST /api/payroll/calculate
    static async calculatePayroll(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, periodStart, periodEnd, periodType } = req.body;

            if (!periodStart || !periodEnd) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "periodStart and periodEnd are required",
                });
            };

            const payrollPeriod = await PayrollExportService.calculatePayrollPeriod({
                tenantUuid,
                storeUuid,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                periodType,
            });

            return res.status(200).json({
                success: true,
                payrollPeriod,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/payroll/:payrollPeriodUuid/approve
    static async approvePayroll(req: Request, res: Response){
        try {
             const { payrollPeriodUuid } = req.params;

            const period = await PayrollExportService.approvePayrollPeriod({
                payrollPeriodUuid,
                approvedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                period,
            });
        } catch (error: any) {
           return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            }); 
        }
    }

    //POST /api/payroll/:payrollPeriodUuid/export
    static async exportPayroll(req: Request, res: Response) {
        try {
            const { payrollPeriodUuid } = req.params;
            const { format } = req.body;

            if (!format) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "format is required",
                });
            }

            const result = await PayrollExportService.exportPayroll({
                payrollPeriodUuid,
                format,
                exportedBy: req.user!.uuid,
            });

            // Set appropriate content type and headers
            let contentType = "text/csv";
            if (format === "EXCEL") {
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            } else if (format === "QUICKBOOKS_IIF") {
                contentType = "application/octet-stream";
            };

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);

            return res.send(result.fileContent);

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}