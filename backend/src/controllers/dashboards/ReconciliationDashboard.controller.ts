import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { ReconciliationDashboardService } from "../../services/Dashboards/ReconciliationDashboard.service.ts";

export class ReconciliationDashboardController {
    // GET /api/v1/reconciliation/overview
    // Tenant-level reconciliation health card
    static async getOverview(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const data = await ReconciliationDashboardService.getOverview(tenantUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getOverview failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /api/v1/reconciliation/stores/:storeUuid/daily?date=YYYY-MM-DD
    // Single day reconciliation report for a store
    static async getDailyReport(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const date = req.query.date
                ? new Date(req.query.date as string)
                : new Date();
        
            const data = await ReconciliationDashboardService.getDailyReport(
                storeUuid,
                date
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getDailyReport failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /api/v1/reconciliation/stores/:storeUuid/history?days=30
    // Reconciliation trend for a store over time
    static async getHistory(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const days = parseInt(req.query.days as string) || 30;
        
            const data = await ReconciliationDashboardService.getHistory({
                storeUuid,
                days,
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getHistory failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /api/v1/reconciliation/unresolved
    // All stores with unresolved variances (tenant admin view)
    static async getUnresolved(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const data = await ReconciliationDashboardService.getUnresolved(tenantUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getUnresolved failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // POST /api/v1/reconciliation/:reconciliationUuid/resolve
    // Mark a variance as reviewed and resolved
    static async resolveVariance(req: Request, res: Response) {
        try {
            const staff = (req as any).user;
            const { reconciliationUuid } = req.params;
            const { resolutionNotes, resolution } = req.body;
        
            if (!resolutionNotes || resolutionNotes.length < 10) {
                return res.status(400).json({
                success: false,
                error: "Resolution notes must be at least 10 characters",
                });
            };
        
            if (!["EXPLAINED", "CORRECTED", "ACCEPTED", "ESCALATED"].includes(resolution)) {
                return res.status(400).json({
                success: false,
                error: "Invalid resolution type",
                });
            };
    
            const data = await ReconciliationDashboardService.resolveVariance({
                reconciliationUuid,
                resolvedBy: staff.uuid,
                resolutionNotes,
                resolution,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            if (error.message === "RECONCILIATION_NOT_FOUND") {
                return res.status(404).json({ success: false, error: error.message });
            }
            logWithContext("error", "[ReconciliationCtrl] resolveVariance failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "RESOLVE_FAILED" });
        }
    }
 
    // GET /api/v1/reconciliation/provider?provider=stripe&days=30
    // Provider reconciliation results (Stripe vs our records)
    static async getProviderReconciliation(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const provider = req.query.provider as string;
            const days = parseInt(req.query.days as string) || 30;
        
            const data =
                await ReconciliationDashboardService.getProviderReconciliation({
                    tenantUuid,
                    provider,
                    days,
                });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getProviderRecon failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /api/v1/reconciliation/metrics/today
    // Today's store daily metrics (populated in real-time by event handlers)
    static async getTodayMetrics(req: Request, res: Response) {
        try {
            const tenantUuid = (req as any).user?.tenantUuid;
            if (!tenantUuid) {
                return res.status(400).json({ success: false, error: "TENANT_REQUIRED" });
            }
        
            const { StoreDailyMetricsService } = await import(
                "../../services/dashboard/StoreDailyMetrics.service.js"
            );
        
            const data = await StoreDailyMetricsService.getTenantSummary(tenantUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[ReconciliationCtrl] getTodayMetrics failed", {
                error: error.message,
            });
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}