import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

//Calculate daily order metrics
//Runs daily at 3:00 AM
export class OrderMetricsCalculationJob {
    static async run(date: Date = new Date()){
        const yesterday = dayjs(date).subtract(1, "day").startOf("day").toDate();
        const today = dayjs(date).startOf("day").toDate();

        logWithContext("info", "[OrderMetrics] Starting calculation", {
            date: yesterday.toISOString(),
        });

        try {
            // Get all stores
            const stores = await prisma.store.findMany({
                where: { active: true },
            });

            let processed = 0;

            for (const store of stores) {
                try {
                    await this.calculateStoreMetrics({
                        storeUuid: store.uuid,
                        tenantUuid: store.tenantUuid,
                        date: yesterday,
                    });

                    processed++;
                } catch (error: any) {
                    logWithContext("error", "[OrderMetrics] Failed to calculate metrics", {
                    storeUuid: store.uuid,
                    error: error.message,
                    });
                }
            };

            logWithContext("info", "[OrderMetrics] Calculation completed", {
                total: stores.length,
                processed,
            });
        } catch (error: any) {
            logWithContext("error", "[OrderMetrics] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }

    private static async calculateStoreMetrics(input: {
        storeUuid: string;
        tenantUuid: string;
        date: Date;
    }) {
        const startOfDay = dayjs(input.date).startOf("day").toDate();
        const endOfDay = dayjs(input.date).endOf("day").toDate();
    
        // Get orders for the day
        const orders = await prisma.order.findMany({
            where: {
                storeUuid: input.storeUuid,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
    
        const totalOrders = orders.length;
        const completedOrders = orders.filter((o) => o.status === "COMPLETED").length;
        const cancelledOrders = orders.filter((o) => o.status === "CANCELLED").length;
    
        const totalRevenue = orders
          .filter((o) => o.status === "COMPLETED")
          .reduce((sum, o) => sum + o.totalAmount, 0);
    
        const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;
    
        // Calculate avg preparation time
        const preparationTimes = orders
          .filter((o) => o.actualReadyAt && o.createdAt)
          .map((o) => o.actualReadyAt!.getTime() - o.createdAt.getTime());
    
        const avgPreparationTime =
          preparationTimes.length > 0
            ? preparationTimes.reduce((sum, t) => sum + t, 0) / preparationTimes.length / 1000 / 60 // minutes
            : 0;
    
        // Save metrics
        await prisma.orderDailyMetrics.upsert({
            where: {
                tenantUuid_storeUuid_date: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                date: startOfDay,
                },
            },
            update: {
                totalOrders,
                completedOrders,
                cancelledOrders,
                totalRevenue,
                avgOrderValue: Math.round(avgOrderValue),
                avgPreparationTime: Math.round(avgPreparationTime),
                calculatedAt: new Date(),
            },
            create: {
                tenantUuid: input.tenantUuid,
                storeUuid: input.storeUuid,
                date: startOfDay,
                totalOrders,
                completedOrders,
                cancelledOrders,
                totalRevenue,
                avgOrderValue: Math.round(avgOrderValue),
                avgPreparationTime: Math.round(avgPreparationTime),
            },
        });
    }
}