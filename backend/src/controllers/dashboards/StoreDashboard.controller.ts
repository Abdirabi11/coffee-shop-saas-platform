import { Request, Response } from "express";
import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { StoreDashboardService } from "../../services/Dashboards/StoreDashboard.service.ts";


// Store manager dashboard endpoint — Add inventory section
//    In your existing StoreManagerDashboard controller, add:
//
//      const inventoryHealth = await InventoryDashboardService
//        .getStoreInventoryHealth(tenantUuid, storeUuid);
//
//      return {
//        ...existingDashboardData,
//        inventory: inventoryHealth,  // ← Add this
//      };
export class StoreDashboardController {
  
    //GET /api/store/dashboard/overview
    static async getOverview(req: Request, res: Response) {
        const traceId = req.headers["x-trace-id"] as string || `dash_${Date.now()}`;

        try {
            const storeUuid = req.store!.uuid;

            const overview = await StoreDashboardService.getOverview(storeUuid);

            return res.status(200).json({
                success: true,
                data: overview,
            });
        } catch (error: any) {
            logWithContext("error", "[StoreDashboard] Failed to get overview", {
                traceId,
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load dashboard",
            }); 
        }
    }

    //GET /api/store/dashboard/active-orders
    static async getActiveOrders(req: Request, res: Response) {
        try {
            const storeUuid = req.store!.uuid;
            const { page, limit } = req.query;

            const orders = await StoreDashboardService.getActiveOrders(storeUuid, {
                page: page ? parseInt(page as string) : 1,
                limit: limit ? parseInt(limit as string) : 20,
            });

            return res.status(200).json({
                success: true,
                data: orders.data,
                meta: orders.meta,
            });

        } catch (error: any) {
            logWithContext("error", "[StoreDashboard] Failed to get active orders", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load active orders",
            });
        }
    }

    //GET /api/store/dashboard/peak-hours
    static async getPeakHours(req: Request, res: Response) {
        try {
            const storeUuid = req.store!.uuid;
            const { dateFrom, dateTo } = req.query;

            const peakHours = await StoreDashboardService.getPeakHours(storeUuid, {
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                data: peakHours,
            });

        } catch (error: any) {
            logWithContext("error", "[StoreDashboard] Failed to get peak hours", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load peak hours",
            });
        }
    }

    //GET /api/store/dashboard/staff
    static async getStaff(req: Request, res: Response) {
        try {
            const storeUuid = req.store!.uuid;
            const { dateFrom, dateTo } = req.query;

            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(7, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const staff = await StoreDashboardService.getStaffPerformance(storeUuid, {
                dateFrom: from,
                dateTo: to,
            });

            return res.status(200).json({
                success: true,
                data: staff,
            });

        } catch (error: any) {
            logWithContext("error", "[StoreDashboard] Failed to get staff", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load staff data",
            });
        }
    }

    //GET /api/store/dashboard/products
    static async getProducts(req: Request, res: Response) {
        try {
            const storeUuid = req.store!.uuid;
            const { dateFrom, dateTo, limit } = req.query;

            const from = dateFrom
                ? new Date(dateFrom as string)
                : dayjs().subtract(30, "day").toDate();
            const to = dateTo ? new Date(dateTo as string) : new Date();

            const products = await StoreDashboardService.getProductPerformance(storeUuid, {
                dateFrom: from,
                dateTo: to,
                limit: limit ? parseInt(limit as string) : 10,
            });

            return res.status(200).json({
                success: true,
                data: products,
            });

        } catch (error: any) {
            logWithContext("error", "[StoreDashboard] Failed to get products", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to load product data",
            });
        }
    }
}