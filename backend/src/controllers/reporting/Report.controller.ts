import { Request, Response } from "express";
import { createReadStream } from "fs";
import path from "path";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { ReportGenerationService } from "../../services/reporting/ReportGeneration.service.ts";

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
        
            // Stream file to client
            const fileStream = createReadStream(result.filePath);
            const fileName = result.fileName;
        
            res.setHeader("Content-Type", format === "PDF" ? "application/pdf" : "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    
            fileStream.pipe(res);

            // Clean up file after sending
            fileStream.on("end", () => {
                const fs = require("fs");
                fs.unlink(result.filePath, (err: any) => {
                    if (err) console.error("Failed to delete temp file:", err);
                });
            });
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

            // Stream file
            const fileStream = createReadStream(result.filePath);

            res.setHeader("Content-Type", format === "PDF" ? "application/pdf" : "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);

            fileStream.pipe(res);

            fileStream.on("end", () => {
                const fs = require("fs");
                fs.unlink(result.filePath, (err: any) => {
                    if (err) console.error("Failed to delete temp file:", err);
                });
            });

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