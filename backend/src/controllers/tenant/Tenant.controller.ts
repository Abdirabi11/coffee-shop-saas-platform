import type { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { TenantDashboardService } from "../../services/tenant/TenantDashboard.service.ts";
import { TenantAnalyticsService } from "../../services/tenant/TenantAnalytics.service.ts";


export class TenantController {
 
    // ─── Dashboard ──────────────────────────────────────────
 
    // GET /tenant/dashboard?timeRange=today|week|month|quarter|year
    static async getDashboard(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const timeRange = (req.query.timeRange as string) || "today";
 
            const data = await TenantDashboardService.getDashboard(tenantUuid, timeRange as any);
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Dashboard failed", { error: error.message });
            return res.status(500).json({ success: false, error: "DASHBOARD_FAILED" });
        }
    }
 
    // GET /tenant/overview?dateFrom=&dateTo=
    static async getOverview(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
            const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
 
            const data = await TenantDashboardService.getOverview(tenantUuid, { dateFrom, dateTo });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Overview failed", { error: error.message });
            return res.status(500).json({ success: false, error: "OVERVIEW_FAILED" });
        }
    }
 
    // GET /tenant/stores/performance?dateFrom=&dateTo=
    static async getStorePerformance(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;
 
            if (!dateFrom || !dateTo) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantDashboardService.getStorePerformance(tenantUuid, {
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Store performance failed", { error: error.message });
            return res.status(500).json({ success: false, error: "STORE_PERFORMANCE_FAILED" });
        }
    }
 
    // GET /tenant/products/top?dateFrom=&dateTo=&limit=10
    static async getTopProducts(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo, limit } = req.query;
 
            if (!dateFrom || !dateTo) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantDashboardService.getTopProducts(tenantUuid, {
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
                limit: limit ? parseInt(limit as string) : 10,
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Top products failed", { error: error.message });
            return res.status(500).json({ success: false, error: "TOP_PRODUCTS_FAILED" });
        }
    }
 
    // GET /tenant/revenue/trend?dateFrom=&dateTo=&groupBy=day|week|month
    static async getRevenueTrend(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo, groupBy } = req.query;
 
            if (!dateFrom || !dateTo) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantDashboardService.getRevenueTrend(tenantUuid, {
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
                groupBy: (groupBy as string) || "day",
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Revenue trend failed", { error: error.message });
            return res.status(500).json({ success: false, error: "REVENUE_TREND_FAILED" });
        }
    }
 
    // GET /tenant/customers?dateFrom=&dateTo=
    static async getCustomerInsights(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { dateFrom, dateTo } = req.query;
 
            if (!dateFrom || !dateTo) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantDashboardService.getCustomerInsights(tenantUuid, {
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Customer insights failed", { error: error.message });
            return res.status(500).json({ success: false, error: "CUSTOMER_INSIGHTS_FAILED" });
        }
    }
 
    // ─── Analytics ──────────────────────────────────────────
 
    // GET /tenant/analytics/revenue?from=&to=&storeUuid=&granularity=
    static async getRevenueAnalytics(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { from, to, storeUuid, granularity } = req.query;
 
            if (!from || !to) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantAnalyticsService.getRevenueTrend({
                tenantUuid,
                storeUuid: storeUuid as string,
                from: new Date(from as string),
                to: new Date(to as string),
                granularity: granularity as any,
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            logWithContext("error", "[Tenant] Revenue analytics failed", { error: error.message });
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // GET /tenant/analytics/payment-methods?from=&to=&storeUuid=
    static async getPaymentMethodBreakdown(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { from, to, storeUuid } = req.query;
 
            if (!from || !to) {
                return res.status(400).json({ success: false, error: "DATE_RANGE_REQUIRED" });
            }
 
            const data = await TenantAnalyticsService.getPaymentMethodBreakdown({
                tenantUuid,
                storeUuid: storeUuid as string,
                from: new Date(from as string),
                to: new Date(to as string),
            });
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // GET /tenant/analytics/peak-hours?storeUuid=&days=30
    static async getPeakHours(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, days } = req.query;
 
            const data = await TenantAnalyticsService.getPeakHoursAnalysis(
                tenantUuid,
                storeUuid as string,
                days ? parseInt(days as string) : 30
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // GET /tenant/analytics/day-of-week?storeUuid=&days=90
    static async getDayOfWeek(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, days } = req.query;
 
            const data = await TenantAnalyticsService.getDayOfWeekAnalysis(
                tenantUuid,
                storeUuid as string,
                days ? parseInt(days as string) : 90
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // GET /tenant/analytics/stores/compare?days=30
    static async getStoreComparison(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { days } = req.query;
 
            const data = await TenantAnalyticsService.getStoreComparison(
                tenantUuid,
                days ? parseInt(days as string) : 30
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // GET /tenant/analytics/customers?days=30
    static async getCustomerAnalytics(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { days } = req.query;
 
            const data = await TenantAnalyticsService.getCustomerAnalytics(
                tenantUuid,
                days ? parseInt(days as string) : 30
            );
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "ANALYTICS_FAILED" });
        }
    }
 
    // ─── Billing & Subscription ─────────────────────────────
 
    // GET /tenant/subscription
    static async getSubscription(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const data = await TenantDashboardService.getSubscriptionInfo(tenantUuid);
 
            if (!data) {
                return res.status(200).json({ success: true, data: null, message: "No active subscription" });
            }
 
            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "SUBSCRIPTION_FETCH_FAILED" });
        }
    }
 
    // GET /tenant/invoices
    static async listInvoices(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const invoices = await prisma.invoice.findMany({
                where: { tenantUuid },
                orderBy: { createdAt: "desc" },
                take: 50,
            });
            return res.status(200).json({ success: true, data: invoices });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "INVOICE_FETCH_FAILED" });
        }
    }
 
    // GET /tenant/invoices/:invoiceUuid/download
    static async downloadInvoice(req: Request, res: Response) {
        try {
            const { invoiceUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
 
            const invoice = await prisma.invoice.findFirst({
                where: { uuid: invoiceUuid, tenantUuid },
            });
 
            if (!invoice?.pdfUrl) {
                return res.status(404).json({ success: false, error: "INVOICE_NOT_FOUND" });
            }
 
            return res.sendFile(invoice.pdfUrl, { root: "storage" });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "DOWNLOAD_FAILED" });
        }
    }
 
    // ─── Active Orders (quick view) ─────────────────────────
 
    // GET /tenant/orders/active
    static async getActiveOrders(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const storeUuid = req.query.storeUuid as string;
 
            const orders = await prisma.order.findMany({
                where: {
                    tenantUuid,
                    ...(storeUuid ? { storeUuid } : {}),
                    status: { in: ["PENDING", "PAID", "PREPARING", "READY"] },
                },
                select: {
                    uuid: true,
                    orderNumber: true,
                    status: true,
                    totalAmount: true,
                    createdAt: true,
                    customerName: true,
                    storeUuid: true,
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            });
 
            return res.status(200).json({ success: true, data: orders });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
 
    // GET /tenant/payments/failed
    static async getFailedPayments(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
 
            const payments = await prisma.payment.findMany({
                where: { tenantUuid, status: "FAILED" },
                orderBy: { createdAt: "desc" },
                take: 50,
                select: {
                    uuid: true,
                    orderUuid: true,
                    amount: true,
                    paymentMethod: true,
                    failureReason: true,
                    storeUuid: true,
                    createdAt: true,
                },
            });
 
            return res.status(200).json({ success: true, data: payments });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: "FETCH_FAILED" });
        }
    }
}