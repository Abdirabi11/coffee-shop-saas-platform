import { Request, Response } from "express";
import dayjs from "dayjs";
import { TenantDashboardService } from "../../services/tenant/tenant-dashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class TenantDashboardController {
  
    //GET /api/tenant/dashboard/overview
    static async getOverview(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `dash_${Date.now()}`;

        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;

            const overview = await TenantDashboardService.getOverview(tenantUuid, {
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                data: overview,
            });
        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get overview", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load dashboard",
            });
        }
    }

    //GET /api/tenant/dashboard/stores
    static async getStores(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;

            // Default: last 30 days
            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(30, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const stores = await TenantDashboardService.getStorePerformance(tenantUuid, {
                dateFrom: from,
                dateTo: to,
            });

            return res.status(200).json({
                success: true,
                data: stores,
            });

        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get stores", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load store data",
            });
        }
    }

    //GET /api/tenant/dashboard/products
    static async getProducts(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo, limit } = req.query;

            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(30, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const products = await TenantDashboardService.getTopProducts(tenantUuid, {
                dateFrom: from,
                dateTo: to,
                limit: limit ? parseInt(limit as string) : 10,
            });

            return res.status(200).json({
                success: true,
                data: products,
            });

        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get products", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load product data",
            });
        }
    }

    //GET /api/tenant/dashboard/revenue
    static async getRevenue(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo, groupBy } = req.query;

            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(30, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const revenue = await TenantDashboardService.getRevenueTrend(tenantUuid, {
                dateFrom: from,
                dateTo: to,
                groupBy: (groupBy as "day" | "week" | "month") || "day",
            });

            return res.status(200).json({
                success: true,
                data: revenue,
            });

        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get revenue", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load revenue data",
            });
        }
    }

    //GET /api/tenant/dashboard/customers
    static async getCustomers(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;

            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(30, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const customers = await TenantDashboardService.getCustomerInsights(tenantUuid, {
                dateFrom: from,
                dateTo: to,
            });

            return res.status(200).json({
                success: true,
                data: customers,
            });

        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get customers", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load customer data",
            });
        }
    }

    //GET /api/tenant/dashboard/subscription
    static async getSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;

            const subscription = await TenantDashboardService.getSubscriptionInfo(tenantUuid);

            if (!subscription) {
                return res.status(404).json({
                error: "NO_SUBSCRIPTION",
                message: "No active subscription found",
                });
            };

            return res.status(200).json({
                success: true,
                data: subscription,
            });

        } catch (error: any) {
            logWithContext("error", "[TenantDashboard] Failed to get subscription", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load subscription data",
            });
        }
    }
}