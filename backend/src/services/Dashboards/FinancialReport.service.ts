import dayjs from "dayjs";
import * as fs from "fs";
import * as path from "path";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
 
 
interface ReportFilter {
    tenantUuid: string;
    storeUuid?: string;
    from: Date;
    to: Date;
    format?: "CSV" | "JSON";
}
 
interface ReportResult {
    fileName: string;
    filePath: string;
    format: string;
    rows: number;
}
 
export class FinancialReportService {
    //DAILY SALES REPORT
    //Revenue per day, breakdown by payment method, tax, refunds, voids
    static async generateDailySalesReport(filters: ReportFilter): Promise<ReportResult> {
        const { tenantUuid, storeUuid, from, to, format = "CSV" } = filters;
    
        logWithContext("info", "[FinancialReport] Generating daily sales", {
            tenantUuid,
            from: from.toISOString(),
            to: to.toISOString(),
        });
    
        // Fetch pre-aggregated daily metrics
        const dailyMetrics = await prisma.storeDailyMetrics.findMany({
            where: {
                tenantUuid,
                ...(storeUuid && { storeUuid }),
                date: { gte: from, lte: to },
            },
            include: { store: { select: { name: true } } },
            orderBy: { date: "asc" },
        });
    
        // Fetch payment method breakdown per day (not in StoreDailyMetrics)
        const paymentsByDayAndMethod = await prisma.payment.groupBy({
            by: ["storeUuid", "paymentMethod"],
            where: {
                tenantUuid,
                ...(storeUuid && { storeUuid }),
                status: { in: ["PAID", "COMPLETED"] },
                createdAt: { gte: from, lte: to },
            },
            _sum: { amount: true },
            _count: true,
        });
    
        // Build method breakdown map
        const methodMap = new Map<string, Record<string, number>>();
        for (const p of paymentsByDayAndMethod) {
            const key = p.storeUuid;
            if (!methodMap.has(key)) methodMap.set(key, {});
            methodMap.get(key)![p.paymentMethod] = p._sum.amount ?? 0;
        }
    
        // Assemble report rows
        const rows = dailyMetrics.map((m) => {
            const methods = methodMap.get(m.storeUuid) ?? {};
            return {
                date: dayjs(m.date).format("YYYY-MM-DD"),
                store: (m as any).store?.name ?? m.storeUuid,
                grossRevenue: m.revenueGross,
                netRevenue: m.revenueNet,
                taxCollected: m.revenueTax,
                discounts: m.revenueDiscount,
                refunds: m.revenueRefunded,
                ordersCompleted: m.ordersCompleted,
                ordersCancelled: m.ordersCancelled,
                paymentsSucceeded: m.paymentsSucceeded,
                paymentsFailed: m.paymentsFailed,
                avgOrderValue: m.avgPaymentValue,
                cashRevenue: methods["CASH"] ?? 0,
                cardRevenue: methods["CARD_TERMINAL"] ?? 0,
                onlineRevenue: (methods["STRIPE"] ?? 0) + (methods["WALLET"] ?? 0) + (methods["EVC_PLUS"] ?? 0),
            };
        });
    
        if (format === "JSON") {
            return this.writeJSON("daily-sales", rows, tenantUuid);
        }
    
        // CSV output
        const headers = [
            "Date", "Store", "Gross Revenue", "Net Revenue", "Tax Collected",
            "Discounts", "Refunds", "Orders Completed", "Orders Cancelled",
            "Payments Succeeded", "Payments Failed", "Avg Order Value",
            "Cash Revenue", "Card Revenue", "Online Revenue",
        ];
    
        return this.writeCSV("daily-sales", headers, rows, tenantUuid);
    }
 
    //WEEKLY CASH DRAWER SUMMARY
    //All drawer sessions across stores for the week
    static async generateDrawerSummaryReport(filters: ReportFilter): Promise<ReportResult> {
        const { tenantUuid, storeUuid, from, to, format = "CSV" } = filters;
    
        logWithContext("info", "[FinancialReport] Generating drawer summary", {
            tenantUuid,
        });
    
        const drawers = await prisma.cashDrawer.findMany({
            where: {
                tenantUuid,
                ...(storeUuid && { storeUuid }),
                status: "CLOSED",
                sessionStart: { gte: from, lte: to },
            },
            include: { store: { select: { name: true } } },
            orderBy: [{ storeUuid: "asc" }, { sessionStart: "asc" }],
        });
    
        const rows = drawers.map((d) => ({
            date: dayjs(d.sessionStart).format("YYYY-MM-DD"),
            store: (d as any).store?.name ?? d.storeUuid,
            terminalId: d.terminalId,
            openedBy: d.openedBy,
            closedBy: d.closedBy,
            sessionStart: dayjs(d.sessionStart).format("HH:mm"),
            sessionEnd: d.sessionEnd ? dayjs(d.sessionEnd).format("HH:mm") : "N/A",
            durationHours: d.sessionEnd
                ? (dayjs(d.sessionEnd).diff(dayjs(d.sessionStart), "minute") / 60).toFixed(1)
                : "N/A",
            openingBalance: d.openingBalance,
            expectedCash: d.expectedCash,
            actualCash: d.actualCash ?? 0,
            cashVariance: d.cashVariance ?? 0,
            expectedCard: d.expectedCard,
            actualCard: d.actualCard ?? 0,
            cardVariance: d.cardVariance ?? 0,
            totalSales: d.totalSales ?? 0,
            cashTransactions: d.cashSalesCount ?? 0,
            cardTransactions: d.cardSalesCount ?? 0,
            closingNotes: d.closingNotes ?? "",
        }));
    
        if (format === "JSON") {
            return this.writeJSON("drawer-summary", rows, tenantUuid);
        }
    
        const headers = [
            "Date", "Store", "Terminal", "Opened By", "Closed By",
            "Session Start", "Session End", "Duration (hrs)",
            "Opening Balance", "Expected Cash", "Actual Cash", "Cash Variance",
            "Expected Card", "Actual Card", "Card Variance",
            "Total Sales", "Cash Txns", "Card Txns", "Notes",
        ];
    
        return this.writeCSV("drawer-summary", headers, rows, tenantUuid);
    }
 
    //MONTHLY P&L SUMMARY
    //Revenue - COGS (labor) - Tax = Gross Margin
    static async generateMonthlyPLReport(input: {
        tenantUuid: string;
        month: string; // "YYYY-MM"
        format?: "CSV" | "JSON";
    }): Promise<ReportResult> {
        const { tenantUuid, month, format = "CSV" } = input;
        const monthStart = dayjs(month).startOf("month").toDate();
        const monthEnd = dayjs(month).endOf("month").toDate();
    
        logWithContext("info", "[FinancialReport] Generating monthly P&L", {
            tenantUuid,
            month,
        });
    
        // Revenue data from StoreDailyMetrics
        const dailyMetrics = await prisma.storeDailyMetrics.findMany({
            where: { tenantUuid, date: { gte: monthStart, lte: monthEnd } },
            include: { store: { select: { name: true } } },
        });
    
        // Group by store
        const storeMap = new Map<
        string,
        {
            name: string;
            grossRevenue: number;
            netRevenue: number;
            tax: number;
            discounts: number;
            refunds: number;
            orders: number;
        }
        >();
    
        for (const m of dailyMetrics) {
            const existing = storeMap.get(m.storeUuid) ?? {
                name: (m as any).store?.name ?? "Unknown",
                grossRevenue: 0,
                netRevenue: 0,
                tax: 0,
                discounts: 0,
                refunds: 0,
                orders: 0,
            };
        
            existing.grossRevenue += m.revenueGross;
            existing.netRevenue += m.revenueNet;
            existing.tax += m.revenueTax;
            existing.discounts += m.revenueDiscount;
            existing.refunds += m.revenueRefunded;
            existing.orders += m.ordersCompleted;
        
            storeMap.set(m.storeUuid, existing);
        }
    
        // Labor costs (from LaborCostSnapshot)
        const laborCosts = await prisma.laborCostSnapshot.findMany({
            where: {
                tenantUuid,
                snapshotDate: { gte: monthStart, lte: monthEnd },
                periodType: "DAILY",
            },
            select: { storeUuid: true, laborCost: true },
        });
    
        const laborByStore = new Map<string, number>();
        for (const l of laborCosts) {
            laborByStore.set(
                l.storeUuid,
                (laborByStore.get(l.storeUuid) ?? 0) + l.laborCost
            );
        }
    
        // Build P&L rows per store
        const rows = Array.from(storeMap.entries()).map(([storeUuid, data]) => {
        const labor = laborByStore.get(storeUuid) ?? 0;
        const grossMargin = data.netRevenue - labor;
    
        return {
            store: data.name,
            grossRevenue: data.grossRevenue,
            discounts: data.discounts,
            refunds: data.refunds,
            netRevenue: data.netRevenue,
            taxCollected: data.tax,
            laborCost: labor,
            grossMargin,
            grossMarginPercent:
            data.netRevenue > 0
                ? Number(((grossMargin / data.netRevenue) * 100).toFixed(2))
                : 0,
            orders: data.orders,
            avgOrderValue:
            data.orders > 0 ? Math.round(data.grossRevenue / data.orders) : 0,
        };
        });
    
        // Add totals row
        const totals = rows.reduce(
            (acc, r) => ({
                store: "TOTAL",
                grossRevenue: acc.grossRevenue + r.grossRevenue,
                discounts: acc.discounts + r.discounts,
                refunds: acc.refunds + r.refunds,
                netRevenue: acc.netRevenue + r.netRevenue,
                taxCollected: acc.taxCollected + r.taxCollected,
                laborCost: acc.laborCost + r.laborCost,
                grossMargin: acc.grossMargin + r.grossMargin,
                grossMarginPercent: 0,
                orders: acc.orders + r.orders,
                avgOrderValue: 0,
            }),
            {
                store: "TOTAL",
                grossRevenue: 0,
                discounts: 0,
                refunds: 0,
                netRevenue: 0,
                taxCollected: 0,
                laborCost: 0,
                grossMargin: 0,
                grossMarginPercent: 0,
                orders: 0,
                avgOrderValue: 0,
            }
        );
        totals.grossMarginPercent =
            totals.netRevenue > 0
                ? Number(((totals.grossMargin / totals.netRevenue) * 100).toFixed(2))
                : 0;
        totals.avgOrderValue =
            totals.orders > 0
                ? Math.round(totals.grossRevenue / totals.orders)
                : 0;
        
        const allRows = [...rows, totals];
        
        if (format === "JSON") {
            return this.writeJSON(`pl-${month}`, allRows, tenantUuid);
        }
    
        const headers = [
            "Store", "Gross Revenue", "Discounts", "Refunds", "Net Revenue",
            "Tax Collected", "Labor Cost", "Gross Margin", "Margin %",
            "Orders", "Avg Order Value",
        ];
    
        return this.writeCSV(`pl-${month}`, headers, allRows, tenantUuid);
    }
 
    //CSV writer
    private static writeCSV(
        reportName: string,
        headers: string[],
        rows: Record<string, any>[],
        tenantUuid: string
    ): ReportResult {
        const timestamp = dayjs().format("YYYYMMDD-HHmmss");
        const fileName = `${reportName}-${timestamp}.csv`;
        const dir = path.join(process.cwd(), "storage", "reports", tenantUuid);
    
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    
        const filePath = path.join(dir, fileName);
    
        const csvLines = [headers.join(",")];
        for (const row of rows) {
            const values = Object.values(row).map((v) => {
                if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
                    return `"${v.replace(/"/g, '""')}"`;
                }
                return String(v ?? "");
            });
            csvLines.push(values.join(","));
        }
    
        fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    
        logWithContext("info", "[FinancialReport] CSV written", {
            fileName,
            rows: rows.length,
        });
    
        return { fileName, filePath, format: "CSV", rows: rows.length };
    }
 
    private static writeJSON(
        reportName: string,
        rows: any[],
        tenantUuid: string
    ): ReportResult {
        const timestamp = dayjs().format("YYYYMMDD-HHmmss");
        const fileName = `${reportName}-${timestamp}.json`;
        const dir = path.join(process.cwd(), "storage", "reports", tenantUuid);
    
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    
        const filePath = path.join(dir, fileName);
    
        fs.writeFileSync(
            filePath,
            JSON.stringify({ generatedAt: new Date().toISOString(), data: rows }, null, 2),
            "utf-8"
        );
    
        return { fileName, filePath, format: "JSON", rows: rows.length };
    }
}