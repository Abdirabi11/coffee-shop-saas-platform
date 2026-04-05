import { Parser } from "json2csv";
import PDFDocument from "pdfkit";
import { createWriteStream, createReadStream } from "fs";
import path from "path";
import dayjs from "dayjs";
import { prisma } from "../../config/prisma.ts"
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class ReportGenerationService {
  
    //Generate Sales Report
    static async generateSalesReport(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
        format: "CSV" | "PDF";
        groupBy?: "day" | "week" | "month";
    }){
        try{
            const startTime = Date.now();

            logWithContext("info", "[Report] Generating sales report", {
                tenantUuid: input.tenantUuid,
                format: input.format,
                dateRange: `${input.dateFrom} to ${input.dateTo}`,
            });

            // Get sales data
            const where: any = {
                tenantUuid: input.tenantUuid,
                status: "COMPLETED",
                createdAt: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
            };

            if (input.storeUuid) {
                where.storeUuid = input.storeUuid;
            };

            const orders = await prisma.order.findMany({
                where,
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                name: true,
                                basePrice: true,
                                },
                            },
                        },
                    },
                    tenantUser: {
                        include: {
                            user: {
                                select: {
                                name: true,
                                phoneNumber: true,
                                },
                            },
                        },
                    },
                    store: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            // Generate report based on format
            let filePath: string;

            if (input.format === "CSV") {
                filePath = await this.generateCSVReport(orders, input);
            } else {
                filePath = await this.generatePDFReport(orders, input);
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[Report] Sales report generated", {
                tenantUuid: input.tenantUuid,
                format: input.format,
                orderCount: orders.length,
                durationMs: duration,
                filePath,
            });

            MetricsService.increment("report.generated", 1, {
                type: "sales",
                format: input.format,
            });

            MetricsService.timing("report.generation.duration", duration);

            return {
                filePath,
                fileName: path.basename(filePath),
                orderCount: orders.length,
                totalRevenue: orders.reduce((sum, o) => sum + o.totalAmount, 0),
            };

        } catch (error: any) {
            logWithContext("error", "[Report] Failed to generate sales report", {
                error: error.message,
            });

            MetricsService.increment("report.generation.failed", 1);

            throw error;
        }
    }

    //Generate CSV Report
    private static async generateCSVReport(orders: any[], input: any): Promise<string> {
        const data = orders.map((order) => ({
            "Order Number": order.orderNumber,
            "Store": order.store?.name || "N/A",
            "Customer": order.tenantUser?.user?.name || "Guest",
            "Phone": order.tenantUser?.user?.phoneNumber || order.customerPhone || "N/A",
            "Order Type": order.orderType,
            "Items": order.items.map((i: any) => `${i.productName} x${i.quantity}`).join(", "),
            "Subtotal": (order.subtotal / 100).toFixed(2),
            "Tax": (order.taxAmount / 100).toFixed(2),
            "Discount": (order.discountAmount / 100).toFixed(2),
            "Total": (order.totalAmount / 100).toFixed(2),
            "Payment Status": order.paymentStatus,
            "Status": order.status,
            "Created At": dayjs(order.createdAt).format("YYYY-MM-DD HH:mm:ss"),
            "Completed At": order.actualReadyAt
                ? dayjs(order.actualReadyAt).format("YYYY-MM-DD HH:mm:ss")
                : "N/A",
        }));
 
        // Convert to CSV
        const parser = new Parser({
            fields: [
                "Order Number",
                "Store",
                "Customer",
                "Phone",
                "Order Type",
                "Items",
                "Subtotal",
                "Tax",
                "Discount",
                "Total",
                "Payment Status",
                "Status",
                "Created At",
                "Completed At",
            ],
        });
 
        const csv = parser.parse(data);
    
        // Save to file
        const fileName = `sales-report-${input.tenantUuid}-${Date.now()}.csv`;
        const filePath = path.join(process.cwd(), "temp", "reports", fileName);
    
        await this.ensureDirectoryExists(path.dirname(filePath));
    
        const fs = require("fs").promises;
        await fs.writeFile(filePath, csv);
    
        return filePath;
    }

    //Generate PDF Report
    private static async generatePDFReport(orders: any[], input: any): Promise<string> {
        const fileName = `sales-report-${input.tenantUuid}-${Date.now()}.pdf`;
        const filePath = path.join(process.cwd(), "temp", "reports", fileName);

        await this.ensureDirectoryExists(path.dirname(filePath));

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const stream = createWriteStream(filePath);

            doc.pipe(stream);

            // Header
            doc.fontSize(20).text("Sales Report", { align: "center" });
            doc.moveDown();

            doc.fontSize(12).text(`Date Range: ${dayjs(input.dateFrom).format("YYYY-MM-DD")} to ${dayjs(input.dateTo).format("YYYY-MM-DD")}`);
            doc.text(`Generated: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`);
            doc.moveDown();

            // Summary
            const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
            const totalOrders = orders.length;
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

            doc.fontSize(14).text("Summary", { underline: true });
            doc.fontSize(10);
            doc.text(`Total Orders: ${totalOrders}`);
            doc.text(`Total Revenue: $${(totalRevenue / 100).toFixed(2)}`);
            doc.text(`Average Order Value: $${(avgOrderValue / 100).toFixed(2)}`);
            doc.moveDown();

            // Orders table
            doc.fontSize(14).text("Orders", { underline: true });
            doc.fontSize(8);

            const tableTop = doc.y;
            let y = tableTop;

            // Table headers
            doc.text("Order #", 50, y);
            doc.text("Customer", 120, y);
            doc.text("Items", 200, y);
            doc.text("Total", 350, y);
            doc.text("Status", 420, y);
            doc.text("Date", 480, y);

            y += 20;

            // Table rows
            orders.slice(0, 50).forEach((order) => { // Limit to 50 orders per page
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                doc.text(order.orderNumber, 50, y, { width: 60 });
                doc.text(order.tenantUser?.user?.name || "Guest", 120, y, { width: 70 });
                doc.text(`${order.items.length} items`, 200, y, { width: 140 });
                doc.text(`$${(order.totalAmount / 100).toFixed(2)}`, 350, y, { width: 60 });
                doc.text(order.status, 420, y, { width: 50 });
                doc.text(dayjs(order.createdAt).format("MM/DD"), 480, y);

                y += 20;
            });

            if (orders.length > 50) {
                doc.moveDown();
                doc.fontSize(10).text(`... and ${orders.length - 50} more orders`, { align: "center" });
            }

            // Footer
            doc.fontSize(8).text(
                `Page ${doc.bufferedPageRange().count}`,
                50,
                doc.page.height - 50,
                { align: "center" }
            );

            doc.end();

            stream.on("finish", () => resolve(filePath));
            stream.on("error", reject);
        });
    }

    //Generate Product Performance Report
    static async generateProductReport(input: {
        tenantUuid: string;
        storeUuid?: string;
        dateFrom: Date;
        dateTo: Date;
        format: "CSV" | "PDF";
    }) {
        try {
            const where: any = {
                tenantUuid: input.tenantUuid,
                date: {
                    gte: input.dateFrom,
                    lte: input.dateTo,
                },
            };

            if (input.storeUuid) {
                where.storeUuid = input.storeUuid;
            }

            const products = await prisma.productDailyMetrics.groupBy({
                by: ["productUuid"],
                where,
                _sum: {
                    quantitySold: true,
                    revenueGross: true,
                    revenueNet: true,
                },
                _count: {
                    uuid: true,
                },
            });

            // Get product details
            const productDetails = await prisma.product.findMany({
                where: {
                    uuid: { in: products.map((p) => p.productUuid) },
                },
                include: {
                    category: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            const data = products.map((p) => {
                const details = productDetails.find((d) => d.uuid === p.productUuid);
                return {
                    productUuid: p.productUuid,
                    name: details?.name || "Unknown",
                    category: details?.category?.name || "N/A",
                    quantitySold: p._sum.quantitySold || 0,
                    revenueGross: p._sum.revenueGross || 0,
                    revenueNet: p._sum.revenueNet || 0,
                    orderCount: p._count.uuid,
                };
            });

            // Sort by revenue
            data.sort((a, b) => b.revenueGross - a.revenueGross);

            let filePath: string;

            if (input.format === "CSV") {
                filePath = await this.generateProductCSV(data, input);
            } else {
                filePath = await this.generateProductPDF(data, input);
            };

            logWithContext("info", "[Report] Product report generated", {
                tenantUuid: input.tenantUuid,
                productCount: data.length,
            });

            return {
                filePath,
                fileName: path.basename(filePath),
                productCount: data.length,
                totalRevenue: data.reduce((sum, p) => sum + p.revenueGross, 0),
            };

        } catch (error: any) {
            logWithContext("error", "[Report] Failed to generate product report", {
                error: error.message,
            });
            throw error;
        }
    }

    private static async generateProductCSV(data: any[], input: any): Promise<string> {
        const csvData = data.map((p) => ({
            "Product": p.name,
            "Category": p.category,
            "Quantity Sold": p.quantitySold,
            "Gross Revenue": (p.revenueGross / 100).toFixed(2),
            "Net Revenue": (p.revenueNet / 100).toFixed(2),
            "Orders": p.orderCount,
        }));
    
        const parser = new Parser({
            fields: ["Product", "Category", "Quantity Sold", "Gross Revenue", "Net Revenue", "Orders"],
        });
    
        const csv = parser.parse(csvData);
    
        const fileName = `product-report-${input.tenantUuid}-${Date.now()}.csv`;
        const filePath = path.join(process.cwd(), "temp", "reports", fileName);
    
        await this.ensureDirectoryExists(path.dirname(filePath));
    
        const fs = require("fs").promises;
        await fs.writeFile(filePath, csv);
    
        return filePath;
    }
    
    private static async generateProductPDF(data: any[], input: any): Promise<string> {
        const fileName = `product-report-${input.tenantUuid}-${Date.now()}.pdf`;
        const filePath = path.join(process.cwd(), "temp", "reports", fileName);
    
        await this.ensureDirectoryExists(path.dirname(filePath));
    
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const stream = createWriteStream(filePath);
        
            doc.pipe(stream);
        
            // Header
            doc.fontSize(20).text("Product Performance Report", { align: "center" });
            doc.moveDown();
        
            doc.fontSize(12).text(`Date Range: ${dayjs(input.dateFrom).format("YYYY-MM-DD")} to ${dayjs(input.dateTo).format("YYYY-MM-DD")}`);
            doc.text(`Generated: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`);
            doc.moveDown();
        
            // Summary
            const totalRevenue = data.reduce((sum, p) => sum + p.revenueGross, 0);
            const totalQuantity = data.reduce((sum, p) => sum + p.quantitySold, 0);
        
            doc.fontSize(14).text("Summary", { underline: true });
            doc.fontSize(10);
            doc.text(`Total Products: ${data.length}`);
            doc.text(`Total Items Sold: ${totalQuantity}`);
            doc.text(`Total Revenue: $${(totalRevenue / 100).toFixed(2)}`);
            doc.moveDown();
        
            // Products table
            doc.fontSize(14).text("Top Products", { underline: true });
            doc.fontSize(8);
    
            let y = doc.y;
    
            // Headers
            doc.text("Product", 50, y);
            doc.text("Category", 200, y);
            doc.text("Qty Sold", 300, y);
            doc.text("Revenue", 380, y);
            doc.text("Orders", 460, y);
        
            y += 20;
        
            // Rows (top 30)
            data.slice(0, 30).forEach((product) => {
                if (y > 700) {
                doc.addPage();
                    y = 50;
                }
    
                doc.text(product.name, 50, y, { width: 140 });
                doc.text(product.category, 200, y, { width: 90 });
                doc.text(product.quantitySold.toString(), 300, y);
                doc.text(`$${(product.revenueGross / 100).toFixed(2)}`, 380, y);
                doc.text(product.orderCount.toString(), 460, y);
        
                y += 20;
            });
        
            doc.end();
    
            stream.on("finish", () => resolve(filePath));
            stream.on("error", reject);
        });
    }
    
    //Ensure directory exists
    private static async ensureDirectoryExists(dirPath: string) {
        const fs = require("fs").promises;
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }
}