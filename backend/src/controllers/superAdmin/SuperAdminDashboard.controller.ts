import { Request, Response } from "express";
import { SuperAdminDashboardService } from "../../services/superAdmin/SuperAdminDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

 
export class SuperAdminDashboardController {
    // GET /api/v1/admin/dashboard/overview
    static async getOverview(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `dash_${Date.now()}`;
    
        try {
            const { dateFrom, dateTo } = req.query;
        
            const data = await SuperAdminDashboardService.getOverview({
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getOverview failed", {
                traceId,
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "DASHBOARD_OVERVIEW_FAILED",
                message: "Failed to load dashboard overview",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/health
    static async getHealth(req: Request, res: Response) {
        try {
            const data = await SuperAdminDashboardService.getPlatformHealth();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getHealth failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "HEALTH_FETCH_FAILED",
                message: "Failed to load platform health",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/revenue?dateFrom=&dateTo=
    static async getRevenue(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;
        
            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            };
        
            const data = await SuperAdminDashboardService.getRevenueBreakdown({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getRevenue failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "REVENUE_FETCH_FAILED",
                message: "Failed to load revenue breakdown",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/tenants?dateFrom=&dateTo=
    static async getTenants(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;
        
            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }
        
            const data = await SuperAdminDashboardService.getTenantAnalytics({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getTenants failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "TENANT_ANALYTICS_FAILED",
                message: "Failed to load tenant analytics",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/growth?dateFrom=&dateTo=
    static async getGrowth(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;
        
            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }
        
            const data = await SuperAdminDashboardService.getGrowthMetrics({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getGrowth failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "GROWTH_FETCH_FAILED",
                message: "Failed to load growth metrics",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/risk
    static async getRisk(req: Request, res: Response) {
        try {
            const data = await SuperAdminDashboardService.getRiskOverview();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getRisk failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "RISK_FETCH_FAILED",
                message: "Failed to load risk overview",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/alerts?limit=20
    static async getAlerts(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const data = await SuperAdminDashboardService.getSystemAlerts(limit);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getAlerts failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "ALERTS_FETCH_FAILED",
                message: "Failed to load system alerts",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/tenant-health
    static async getTenantHealth(req: Request, res: Response) {
        try {
            const data = await SuperAdminDashboardService.getTenantHealth();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getTenantHealth failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "TENANT_HEALTH_FAILED",
                message: "Failed to load tenant health",
            });
        }
    }
    
    // GET /api/v1/admin/dashboard/tenant-list?status=ACTIVE&limit=50&offset=0
    static async getTenantList(req: Request, res: Response) {
        try {
            const { status, limit, offset } = req.query;
        
            const data = await SuperAdminDashboardService.getTenantList({
                status: status as string,
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] getTenantList failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "TENANT_LIST_FAILED",
                message: "Failed to load tenant list",
            });
        }
    }
};