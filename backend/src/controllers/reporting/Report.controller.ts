import { Request, Response } from "express";
import fs from "node:fs";
import path from "path";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ReportGenerationService } from "../../services/reporting/ReportGeneration.service.ts";

// Stream a generated report, then delete the temp file. "close" fires after
// the download finishes or the client goes away. (The old cleanup used
// CommonJS require, which doesn't exist in the ES-module build: it threw
// inside the stream handler and crashed the process.)
function sendReportFile(res: Response, filePath: string, fileName: string, contentType: string) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
        logWithContext("error", "[Report] Report file stream failed", { error: error.message });
        if (!res.headersSent) res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to send report" });
        else res.destroy(error);
    });
    stream.on("close", () => {
        fs.unlink(filePath, () => {});
    });
    stream.pipe(res);
}

export class ReportController {
  
    //POST /api/reports/sales
    //Generate sales report
    static async generateSalesReport(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `report_${Date.now()}`;
    
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, dateFrom, dateTo, format, groupBy } = req.body;

            // Validate dates
            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }

            const result = await ReportGenerationService.generateSalesReport({
                tenantUuid,
                storeUuid,
                dateFrom: new Date(dateFrom),
                dateTo: new Date(dateTo),
                format: format || "CSV",
                groupBy,
            });

            logWithContext("info", "[Report] Sales report generated", {
                traceId,
                tenantUuid,
                format: format || "CSV",
            });
        
            return sendReportFile(res, result.filePath, result.fileName, format === "PDF" ? "application/pdf" : "text/csv");
        } catch (error: any) {
            logWithContext("error", "[Report] Failed to generate sales report", {
                traceId,
                error: error.message,
            });
        
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to generate report",
            });
        }
    }

    //POST /api/reports/products
    //Generate product performance report
    static async generateProductReport(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `report_${Date.now()}`;
    
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, dateFrom, dateTo, format } = req.body;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }

            const result = await ReportGenerationService.generateProductReport({
                tenantUuid,
                storeUuid,
                dateFrom: new Date(dateFrom),
                dateTo: new Date(dateTo),
                format: format || "CSV",
            });

            logWithContext("info", "[Report] Product report generated", {
                traceId,
                tenantUuid,
            });

            return sendReportFile(res, result.filePath, result.fileName, format === "PDF" ? "application/pdf" : "text/csv");

        } catch (error: any) {
            logWithContext("error", "[Report] Failed to generate product report", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to generate report",
            });
        }
    }

    //GET /api/reports/history
    //Get report generation history
    static async getReportHistory(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            // You can track report generation in a table
            const reports = await prisma.reportHistory.findMany({
                where: { tenantUuid },
                orderBy: { createdAt: "desc" },
                take: 50,
            });
      
            return res.status(200).json({
                success: true,
                reports,
            });
      
        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to get report history",
            });
        }
    }
}