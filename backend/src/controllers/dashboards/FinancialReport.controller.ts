import type { Request, Response } from "express";
import fs from "node:fs";
import { FinancialReportService } from "../../services/Dashboards/FinancialReport.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

// Stream a generated CSV, then delete the temp file. "close" fires after the
// download finishes or the client goes away, so the file never lingers. (The
// old cleanup used CommonJS require, which doesn't exist in the ES-module
// build: every export threw inside the stream handler and crashed the process.)
function sendReportFile(res: Response, result: { fileName: string; filePath: string }) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    const stream = fs.createReadStream(result.filePath);
    stream.on("error", (error) => {
        logWithContext("error", "[ReportCtrl] Report file stream failed", { error: error.message });
        if (!res.headersSent) res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        else res.destroy(error);
    });
    stream.on("close", () => {
        fs.unlink(result.filePath, () => {});
    });
    stream.pipe(res);
}

export class FinancialReportController {
    // POST /api/v1/reports/daily-sales
    static async generateDailySales(req: Request, res: Response) {
        try {
            // Verified tenant (requireTenantContext), not the login tenant on the token
            const tenantUuid = req.tenant!.uuid;
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
            return sendReportFile(res, result);
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] dailySales failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
    
    // POST /api/v1/reports/drawer-summary
    static async generateDrawerSummary(req: Request, res: Response) {
        try {
            // Verified tenant (requireTenantContext), not the login tenant on the token
            const tenantUuid = req.tenant!.uuid;
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
            return sendReportFile(res, result);
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] drawerSummary failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
    
    // POST /api/v1/reports/monthly-pl
    static async generateMonthlyPL(req: Request, res: Response) {
        try {
            // Verified tenant (requireTenantContext), not the login tenant on the token
            const tenantUuid = req.tenant!.uuid;
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
            return sendReportFile(res, result);
        } catch (error: any) {
            logWithContext("error", "[ReportCtrl] monthlyPL failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REPORT_GENERATION_FAILED" });
        }
    }
}