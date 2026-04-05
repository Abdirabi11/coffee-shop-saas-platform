import { Request, Response } from "express";
import { CashDrawerReportService } from "../../services/Dashboards/CashDrawerReport.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

 
export class CashDrawerReportController {
    // GET /api/v1/drawer-reports/:drawerUuid/shift
    // Full shift report — what the manager reviews before sign-off
    static async getShiftReport(req: Request, res: Response) {
        try {
            const { drawerUuid } = req.params;
        
            const data = await CashDrawerReportService.getShiftReport(drawerUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            if (error.message === "DRAWER_NOT_FOUND") {
                return res.status(404).json({ success: false, error: error.message });
            }
            logWithContext("error", "[DrawerReportCtrl] getShiftReport failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/drawer-reports/stores/:storeUuid/sessions?days=7&terminalId=T1
    // Session history for a store (or specific terminal)
    static async getSessionHistory(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const days = parseInt(req.query.days as string) || 7;
            const terminalId = req.query.terminalId as string;
            const limit = parseInt(req.query.limit as string) || 50;
        
            const data = await CashDrawerReportService.getSessionHistory({
                storeUuid,
                days,
                terminalId,
                limit,
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[DrawerReportCtrl] getSessionHistory failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/drawer-reports/stores/:storeUuid/terminals?days=30
    // Terminal performance comparison
    static async getTerminalPerformance(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const days = parseInt(req.query.days as string) || 30;
        
            const data = await CashDrawerReportService.getTerminalPerformance(
                storeUuid,
                days
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[DrawerReportCtrl] getTerminalPerformance failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
    
    // GET /api/v1/drawer-reports/stores/:storeUuid/daily?date=YYYY-MM-DD
    // All drawer sessions for a store on a specific day
    static async getDailySummary(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const date = req.query.date
                ? new Date(req.query.date as string)
                : undefined;
        
            const data = await CashDrawerReportService.getDailySummary(
                storeUuid,
                date
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[DrawerReportCtrl] getDailySummary failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}