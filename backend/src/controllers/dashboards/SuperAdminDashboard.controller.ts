import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";
import { SuperAdminDashboardService } from "../../services/Dashboards/SuperAdminDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class SuperAdminDashboardController {

    //GET /api/admin/dashboard/overview
    static async getOverview(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `dash_${Date.now()}`;

        try {
            const { dateFrom, dateTo } = req.query;

            const overview = await SuperAdminDashboardService.getOverview({
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                data: overview,
            });
        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get overview", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load dashboard",
            });
        }
    }

    //GET /api/admin/dashboard/health
    static async getHealth(req: Request, res: Response) {
        try {
            const health = await SuperAdminDashboardService.getPlatformHealth();

            return res.status(200).json({
                success: true,
                data: health,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get health", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load health metrics",
            });
        }
    }

    //GET /api/admin/dashboard/revenue
    static async getRevenue(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }

            const revenue = await SuperAdminDashboardService.getRevenueBreakdown({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });

            return res.status(200).json({
                success: true,
                data: revenue,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get revenue", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load revenue data",
            });
        }
    }

    //GET /api/admin/dashboard/tenants
    static async getTenants(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "dateFrom and dateTo are required",
                });
            }

            const tenants = await SuperAdminDashboardService.getTenantAnalytics({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });

            return res.status(200).json({
                success: true,
                data: tenants,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get tenant analytics", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load tenant analytics",
            });
        }
    }

    //GET /api/admin/dashboard/growth
    static async getGrowth(req: Request, res: Response) {
        try {
            const { dateFrom, dateTo } = req.query;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            }

            const growth = await SuperAdminDashboardService.getGrowthMetrics({
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });

            return res.status(200).json({
                success: true,
                data: growth,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get growth", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load growth metrics",
            });
        }
    }

    //GET /api/admin/dashboard/risk
    static async getRisk(req: Request, res: Response) {
        try {
            const risk = await SuperAdminDashboardService.getRiskOverview();

            return res.status(200).json({
                success: true,
                data: risk,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get risk", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load risk metrics",
            });
        }
    }

    //GET /api/admin/dashboard/alerts
    static async getAlerts(req: Request, res: Response) {
        try {
            const alerts = await SuperAdminDashboardService.getSystemAlerts();

            return res.status(200).json({
                success: true,
                data: alerts,
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get alerts", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load alerts",
            });
        }
    }

    //GET /api/admin/dashboard/analytics
    static async getAnalytics(req: Request, res: Response) {
        try {
            const { type, period } = req.query;

            if (!type) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "type is required",
                });
            }

            const snapshots = await prisma.analyticsSnapshot.findMany({
                where: {
                    type: type as string,
                    status: "COMPLETED",
                },
                orderBy: { periodStart: "desc" },
                take: parseInt(period as string) || 12,
            });

            return res.status(200).json({
                success: true,
                data: snapshots.map((s) => ({
                    period: s.periodStart,
                    metrics: s.metrics,
                })),
            });

        } catch (error: any) {
            logWithContext("error", "[SuperAdminDashboard] Failed to get analytics", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load analytics",
            });
        }
    }

}