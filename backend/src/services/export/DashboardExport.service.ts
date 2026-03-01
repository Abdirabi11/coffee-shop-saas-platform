import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import { SuperAdminDashboardService } from "../Dashboards/SuperAdminDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { TenantDashboardService } from "../Dashboards/TenantDashboard.service.ts";

export class DashboardExportService {
  
    //Export super admin dashboard to CSV
    static async exportSuperAdminCSV(input: {
        dateFrom: Date;
        dateTo: Date;
    }): Promise<string> {
        try {
            const [overview, revenue, growth] = await Promise.all([
                SuperAdminDashboardService.getOverview(input),
                SuperAdminDashboardService.getRevenueBreakdown(input),
                SuperAdminDashboardService.getGrowthMetrics(input),
            ]);

            const data = {
                // Overview
                totalTenants: overview.tenants.total,
                activeTenants: overview.tenants.active,
                churnRate: overview.tenants.churnRate,
                
                // Revenue
                totalRevenue: revenue.bySource.subscriptions + revenue.bySource.orders,
                subscriptionRevenue: revenue.bySource.subscriptions,
                orderRevenue: revenue.bySource.orders,
                mrr: revenue.mrr,
                
                // Growth
                tenantGrowth: growth.tenants.growth,
                revenueGrowth: growth.revenue.growth,
                orderGrowth: growth.orders.growth,
            };

            const parser = new Parser();
            const csv = parser.parse([data]);

            return csv;
        } catch (error: any) {
            logWithContext("error", "[Export] Failed to export super admin CSV", {
                error: error.message,
            });
            throw error;
        }
    }

    //Export tenant dashboard to Excel
    static async exportTenantExcel(input: {
        tenantUuid: string;
        dateFrom: Date;
        dateTo: Date;
    }): Promise<Buffer> {
        try {
            const [overview, stores, products, revenue, customers] = await Promise.all([
                TenantDashboardService.getOverview(input.tenantUuid, input),
                TenantDashboardService.getStorePerformance(input.tenantUuid, input),
                TenantDashboardService.getTopProducts(input.tenantUuid, input),
                TenantDashboardService.getRevenueTrend(input.tenantUuid, {
                    ...input,
                    groupBy: "day",
                }),
                TenantDashboardService.getCustomerInsights(input.tenantUuid, input),
            ]);

            const workbook = new ExcelJS.Workbook();

            // Overview sheet
            const overviewSheet = workbook.addWorksheet("Overview");
            overviewSheet.columns = [
                { header: "Metric", key: "metric", width: 30 },
                { header: "Value", key: "value", width: 20 },
            ];

            overviewSheet.addRows([
                { metric: "Total Stores", value: overview.stores.total },
                { metric: "Active Stores", value: overview.stores.active },
                { metric: "Total Orders", value: overview.orders.total },
                { metric: "Completed Orders", value: overview.orders.completed },
                { metric: "Total Revenue", value: (overview.revenue.total / 100).toFixed(2) },
                { metric: "Total Customers", value: overview.customers.total },
                { metric: "Active Customers", value: overview.customers.active },
            ]);

            // Store performance sheet
            const storesSheet = workbook.addWorksheet("Stores");
            storesSheet.columns = [
                { header: "Store", key: "storeName", width: 30 },
                { header: "Revenue", key: "revenue", width: 15 },
                { header: "Orders", key: "orders", width: 15 },
                { header: "Avg Prep Time (min)", key: "avgPrepTime", width: 20 },
            ];

            storesSheet.addRows(
                stores.map((s) => ({
                    storeName: s.storeName,
                    revenue: (s.revenue / 100).toFixed(2),
                    orders: s.orders,
                    avgPrepTime: s.avgPrepTime.toFixed(1),
                }))
            );

            // Products sheet
            const productsSheet = workbook.addWorksheet("Top Products");
            productsSheet.columns = [
                { header: "Product", key: "productName", width: 30 },
                { header: "Quantity Sold", key: "quantity", width: 15 },
                { header: "Revenue", key: "revenue", width: 15 },
            ];

            productsSheet.addRows(
                products.map((p) => ({
                    productName: p.product?.name || "Unknown",
                    quantity: p.quantitySold,
                    revenue: (p.revenue / 100).toFixed(2),
                }))
            );

            // Revenue trend sheet
            const revenueSheet = workbook.addWorksheet("Revenue Trend");
            revenueSheet.columns = [
                { header: "Date", key: "date", width: 15 },
                { header: "Revenue", key: "revenue", width: 15 },
                { header: "Orders", key: "orders", width: 15 },
            ];

            revenueSheet.addRows(
                revenue.map((r) => ({
                    date: new Date(r.date).toLocaleDateString(),
                    revenue: (r.revenue / 100).toFixed(2),
                    orders: r.orders,
                }))
            );

            // Generate buffer
            const buffer = await workbook.xlsx.writeBuffer();
            return buffer as Buffer;

        } catch (error: any) {
            logWithContext("error", "[Export] Failed to export tenant Excel", {
                error: error.message,
            });
            throw error;
        }
    }


}