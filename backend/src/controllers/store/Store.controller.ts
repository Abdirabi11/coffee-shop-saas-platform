import type { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { StoreDashboardService } from "../../services/Dashboards/StoreDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { StoreDailyMetricsService } from "../../services/Dashboards/StoreDailyMetrics.service.ts";
import { StoreHoursService } from "../../services/store/storeHours.service.ts";

export class StoreController {
 
    // ─── Dashboard ──────────────────────────────────────────
 
    // GET /store/:storeUuid/dashboard
    static async getDashboard(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
 
            const data = await StoreDashboardService.getDashboard(tenantUuid, storeUuid);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Store] Dashboard failed", { error: error.message });
            return res.status(500).json({ success: false, error: "DASHBOARD_FAILED" });
        }
    }
 
    // GET /store/:storeUuid/metrics/today
    static async getTodayMetrics(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
 
            const data = await StoreDailyMetricsService.getToday(tenantUuid, storeUuid);
            return res.status(200).json({ success: true, data: data || { message: "No data for today yet" } });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "METRICS_FAILED" });
        }
    }
 
    // GET /store/:storeUuid/metrics/range?from=&to=
    static async getMetricsRange(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
            const { from, to } = req.query;
 
            if (!from || !to) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await StoreDailyMetricsService.getRange(
                tenantUuid, storeUuid,
                new Date(from as string), new Date(to as string)
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "METRICS_FAILED" });
        }
    }
 
    // GET /store/:storeUuid/orders/active?page=1&limit=20
    static async getActiveOrders(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
 
            const orders = await prisma.order.findMany({
                where: {
                    storeUuid,
                    status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                },
                select: {
                    uuid: true,
                    orderNumber: true,
                    status: true,
                    totalAmount: true,
                    customerName: true,
                    customerNotes: true,
                    orderType: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "asc" },
                take: 50,
            });
 
            return res.status(200).json({ success: true, data: orders });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // ─── Store Hours ────────────────────────────────────────
 
    // GET /store/:storeUuid/hours
    static async getHours(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const hours = await StoreHoursService.getHours(storeUuid);
            return res.status(200).json({ success: true, data: hours });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // PUT /store/:storeUuid/hours
    static async setHours(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { dayOfWeek, openTime, closeTime, isClosed, is24Hours } = req.body;
 
            if (!dayOfWeek) {
                return res.status(400).json({ success: false, error: "DAY_OF_WEEK_REQUIRED" });
            }
 
            const hours = await StoreHoursService.setHours(storeUuid, {
                dayOfWeek, openTime, closeTime, isClosed, is24Hours,
            });
 
            return res.status(200).json({ success: true, data: hours });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "SET_HOURS_FAILED" });
        }
    }
 
    // PUT /store/:storeUuid/hours/bulk
    static async setBulkHours(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { schedule } = req.body;
 
            if (!schedule || !Array.isArray(schedule)) {
                return res.status(400).json({ success: false, error: "SCHEDULE_ARRAY_REQUIRED" });
            }
 
            const results = await StoreHoursService.setBulkHours(storeUuid, schedule);
            return res.status(200).json({ success: true, data: results });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "SET_HOURS_FAILED" });
        }
    }
 
    // GET /store/:storeUuid/hours/status
    static async getOpenStatus(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const isOpen = await StoreHoursService.isStoreOpen(storeUuid);
            return res.status(200).json({ success: true, data: { storeUuid, isOpen } });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "CHECK_FAILED" });
        }
    }
 
    // ─── Exceptions (holidays, special hours) ───────────────
 
    // GET /store/:storeUuid/hours/exceptions
    static async getExceptions(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const exceptions = await StoreHoursService.getExceptions(storeUuid);
            return res.status(200).json({ success: true, data: exceptions });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // POST /store/:storeUuid/hours/exceptions
    static async addException(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { exceptionDate, reason, isClosed, openTime, closeTime } = req.body;
 
            if (!exceptionDate || !reason) {
                return res.status(400).json({ success: false, error: "DATE_AND_REASON_REQUIRED" });
            }
 
            const exception = await StoreHoursService.addException(storeUuid, {
                exceptionDate: new Date(exceptionDate),
                reason, isClosed: isClosed ?? true, openTime, closeTime,
            });
 
            return res.status(201).json({ success: true, data: exception });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ADD_EXCEPTION_FAILED" });
        }
    }
 
    // DELETE /store/:storeUuid/hours/exceptions/:exceptionUuid
    static async removeException(req: Request, res: Response) {
        try {
            const { exceptionUuid } = req.params;
            await StoreHoursService.removeException(exceptionUuid);
            return res.status(200).json({ success: true, message: "Exception removed" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "REMOVE_FAILED" });
        }
    }
 
    // ─── Store Info ─────────────────────────────────────────
 
    // GET /store/:storeUuid
    static async getStore(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
 
            const store = await prisma.store.findFirst({
                where: { uuid: storeUuid, tenantUuid },
            });
 
            if (!store) {
                return res.status(404).json({ success: false, error: "STORE_NOT_FOUND" });
            }
 
            const isOpen = await StoreHoursService.isStoreOpen(storeUuid);
 
            return res.status(200).json({
                success: true,
                data: { ...store, isOpen },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /store (list all stores for tenant)
    static async listStores(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
 
            const stores = await prisma.store.findMany({
                where: { tenantUuid },
                orderBy: { name: "asc" },
            });
 
            return res.status(200).json({ success: true, data: stores });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}