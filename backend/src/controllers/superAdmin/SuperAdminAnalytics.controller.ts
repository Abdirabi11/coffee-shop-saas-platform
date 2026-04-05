import { Request, Response } from "express";
import { SuperAdminAnalyticsService } from "../../services/superAdmin/SuperAdminAnalytics.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
export class SuperAdminAnalyticsController {
    // GET /api/v1/admin/analytics/kpis
    static async getKPIs(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getKPIs();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getKPIs failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "KPI_FETCH_FAILED",
                message: "Failed to load KPIs",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/revenue?months=12
    static async getRevenueTrend(req: Request, res: Response) {
        try {
            const months = parseInt(req.query.months as string) || 12;
            const data = await SuperAdminAnalyticsService.getRevenueTrend(months);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getRevenueTrend failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "REVENUE_TREND_FAILED",
                message: "Failed to load revenue trend",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/churn
    static async getChurn(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getChurnAnalytics();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getChurn failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "CHURN_FETCH_FAILED",
                message: "Failed to load churn analytics",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/arpu-ltv
    static async getArpuLtv(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getArpuLtv();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getArpuLtv failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "ARPU_LTV_FAILED",
                message: "Failed to load ARPU/LTV analytics",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/cohort-retention
    static async getCohortRetention(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getCohortRetention();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getCohortRetention failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "COHORT_RETENTION_FAILED",
                message: "Failed to load cohort retention",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/tenant-growth
    static async getTenantGrowth(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getTenantCohortGrowth();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getTenantGrowth failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "TENANT_GROWTH_FAILED",
                message: "Failed to load tenant growth",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/fraud
    static async getFraud(req: Request, res: Response) {
        try {
            const data = await SuperAdminAnalyticsService.getFraudAnalytics();
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getFraud failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "FRAUD_ANALYTICS_FAILED",
                message: "Failed to load fraud analytics",
            });
        }
    }
    
    // GET /api/v1/admin/analytics/snapshots?type=CHURN&limit=12
    static async getSnapshots(req: Request, res: Response) {
        try {
            const { type, limit, tenantUuid, storeUuid } = req.query;
        
            if (!type) {
                return res.status(400).json({
                    success: false,
                    error: "VALIDATION_ERROR",
                    message: "type query parameter is required",
                });
            }
        
            const data = await SuperAdminAnalyticsService.getSnapshots({
                type: type as string,
                limit: limit ? parseInt(limit as string) : undefined,
                tenantUuid: tenantUuid as string,
                storeUuid: storeUuid as string,
            });
        
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminAnalytics] getSnapshots failed", {
                error: error.message,
            });
            return res.status(500).json({
                success: false,
                error: "SNAPSHOTS_FETCH_FAILED",
                message: "Failed to load analytics snapshots",
            });
        }
    }
}