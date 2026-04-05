import { Request, Response } from "express";
import { createReadStream } from "fs";
import { FinancialReportService } from "../../services/Dashboards/FinancialReport.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class FinancialReportController {
    // POST /api/v1/reports/daily-sales
    static async generateDailySales(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { storeUuid, from, to, format } = req.body;
        
            if (!from || !to) {
                return res.status(400).json({ success: false, error: "from and to are required" });
            }
        
            const result = await FinancialReportService.generateDailySalesReport({
                tenantUuid,
                storeUuid,
                from: new Date(from),
                to: new Date(to),
                format: format || "CSV",
            });
        
            if (format === "JSON") {
                return res.status(200).json({ success: true, data: result });
            }
    
            // Stream CSV file to client
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
            const stream = createReadStream(result.filePath);
            stream.pipe(res);
            stream.on("end", () => {
                require("fs").unlink(result.filePath, () => {});
            });
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] dailySales failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
    
    // POST /api/v1/reports/drawer-summary
    static async generateDrawerSummary(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { storeUuid, from, to, format } = req.body;
        
            if (!from || !to) {
                return res.status(400).json({ success: false, error: "from and to are required" });
            }
        
            const result = await FinancialReportService.generateDrawerSummaryReport({
                tenantUuid,
                storeUuid,
                from: new Date(from),
                to: new Date(to),
                format: format || "CSV",
            });
        
            if (format === "JSON") {
                return res.status(200).json({ success: true, data: result });
            }
        
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
            const stream = createReadStream(result.filePath);
            stream.pipe(res);
            stream.on("end", () => {
                require("fs").unlink(result.filePath, () => {});
            });
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] drawerSummary failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
    
    // POST /api/v1/reports/monthly-pl
    static async generateMonthlyPL(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            const { month, format } = req.body;
        
            if (!month) {
                return res.status(400).json({ success: false, error: "month (YYYY-MM) is required" });
            }
        
            const result = await FinancialReportService.generateMonthlyPLReport({
                tenantUuid,
                month,
                format: format || "CSV",
            });
        
            if (format === "JSON") {
                return res.status(200).json({ success: true, data: result });
            }
        
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
            const stream = createReadStream(result.filePath);
            stream.pipe(res);
            stream.on("end", () => {
                require("fs").unlink(result.filePath, () => {});
            });
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] monthlyPL failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
}