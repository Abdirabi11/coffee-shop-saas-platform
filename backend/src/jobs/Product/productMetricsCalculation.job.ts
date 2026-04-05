import dayjs from "dayjs"
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

//Calculate daily metrics for all products
//Runs daily at 2:00 AM
export class ProductMetricsCalculationJob{
    static async run(date: Date = new Date()){
        const yesterday= dayjs(date).subtract(1, "day").startOf("day").toDate();
        const today = dayjs(date).startOf("day").toDate();

        logWithContext("info", "[ProductMetrics] Starting calculation", {
            date: yesterday.toISOString(),
        });

        try {
            // Get all active products
            const products = await prisma.product.findMany({
                where: {
                    isActive: true,
                    isDeleted: false,
                },
                select: {
                    uuid: true,
                    tenantUuid: true,
                    storeUuid: true,
                },
            });

            let processed = 0;
            let failed = 0;

            for (const product of products) {
                try{
                    await this.calculateProductMetrics({
                        productUuid: product.uuid,
                        tenantUuid: product.tenantUuid,
                        storeUuid: product.storeUuid,
                        date: yesterday,
                    });
            
                    processed++;
                } catch (error: any) {
                    failed++;
                    logWithContext("error", "[ProductMetrics] Failed to calculate metrics", {
                        productUuid: product.uuid,
                        error: error.message,
                    });
                }
            };

            logWithContext("info", "[ProductMetrics] Calculation completed", {
                total: products.length,
                processed,
                failed,
            });

        } catch (error: any) {
            logWithContext("error", "[ProductMetrics] Job failed", {
                error: error.message,
            });
            throw error;  
        }
    }

    //Calculate metrics for single product
    private static async calculateProductMetrics(input: {
        productUuid: string;
        tenantUuid: string;
        storeUuid: string;
        date: Date;
    }) {
        const startOfDay = dayjs(input.date).startOf("day").toDate();
        const endOfDay = dayjs(input.date).endOf("day").toDate();

        // Get order items for this product
        const orderItems = await prisma.orderItem.findMany({
            where: {
                productUuid: input.productUuid,
                order: {
                status: "COMPLETED",
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                },
            },
            include: {
                order: true,
            },
        });

        // Calculate metrics
        const quantitySold = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const ordersCount = new Set(orderItems.map(item => item.orderUuid)).size;
        const revenueGross = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const revenueNet = orderItems.reduce((sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity, 0);
        const avgSellingPrice = quantitySold > 0 ? Math.round(revenueGross / quantitySold) : 0;

        // Get inventory data
        const inventory = await prisma.inventoryItem.findFirst({
            where: {
                productUuid: input.productUuid,
                storeUuid: input.storeUuid,
            },
        });

        // Upsert metrics
        await prisma.productDailyMetrics.upsert({
            where: {
                tenantUuid_productUuid_storeUuid_date: {
                tenantUuid: input.tenantUuid,
                productUuid: input.productUuid,
                storeUuid: input.storeUuid,
                date: startOfDay,
                },
            },
            update: {
                quantitySold,
                ordersCount,
                revenueGross,
                revenueNet,
                avgSellingPrice,
                stockAtEnd: inventory?.quantity,
                calculatedAt: new Date(),
            },
            create: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                productUuid: input.productUuid,
                date: startOfDay,
                quantitySold,
                ordersCount,
                revenueGross,
                revenueNet,
                avgSellingPrice,
                stockAtStart: inventory?.quantity,
                stockAtEnd: inventory?.quantity,
            },
        });
    }
} 