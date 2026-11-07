import { json2csv } from "json-2-csv";
import ExcelJS from "exceljs";
import { SuperAdminDashboardService } from "../superAdmin/SuperAdminDashboard.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { TenantDashboardService } from "../tenant/TenantDashboard.service.ts";

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

            const subscriptionRevenue = revenue.invoices.revenue;
            const orderRevenue = revenue.byFlow.reduce((sum, f) => sum + f.revenue, 0);

            const data = {
                // Overview
                totalTenants: overview.tenants.total,
                activeTenants: overview.tenants.active,
                churnRate: overview.tenants.churnRate,
                
                // Revenue
                // Subscriptions are billed through invoices; order revenue is the payment flows
                totalRevenue: subscriptionRevenue + orderRevenue,
                subscriptionRevenue,
                orderRevenue,
                mrr: revenue.mrr,
                
                // Growth
                tenantGrowth: growth.tenants.growth,
                revenueGrowth: growth.revenue.growth,
                orderGrowth: growth.orders.growth,
            };

            return json2csv([data]);
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
                { metric: "Stores", value: overview.totalStores },
                { metric: "Completed Orders", value: overview.completedOrders },
                { metric: "Average Order Value", value: (overview.averageOrderValue / 100).toFixed(2) },
                { metric: "Net Revenue", value: (overview.revenue / 100).toFixed(2) },
                { metric: "Gross Revenue", value: (overview.revenueDetail.gross / 100).toFixed(2) },
                { metric: "Refunds", value: (overview.revenueDetail.refunds / 100).toFixed(2) },
                { metric: "Failed Payments", value: overview.failedPayments },
                { metric: "Total Customers", value: customers.total },
                { metric: "Active Customers", value: customers.activeInPeriod },
            ]);

            // Store performance sheet
            const storesSheet = workbook.addWorksheet("Stores");
            storesSheet.columns = [
                { header: "Store", key: "storeName", width: 30 },
                { header: "Revenue", key: "revenue", width: 15 },
                { header: "Orders", key: "orders", width: 15 },
            ];

            storesSheet.addRows(
                stores.map((s) => ({
                    storeName: s.storeName,
                    revenue: (s.revenue / 100).toFixed(2),
                    orders: s.orderCount,
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
                    productName: p.name || "Unknown",
                    quantity: p.quantity,
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
                revenue.data.map((r) => ({
                    date: r.period,
                    revenue: (r.revenue / 100).toFixed(2),
                    orders: r.orderCount,
                }))
            );

            // Generate buffer
            const buffer = await workbook.xlsx.writeBuffer();
            return Buffer.from(buffer);

        } catch (error: any) {
            logWithContext("error", "[Export] Failed to export tenant Excel", {
                error: error.message,
            });
            throw error;
        }
    }


}