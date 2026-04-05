import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class StaleOrderMetricsJob{
    static async runDaily(){
        logWithContext("info", "[StaleOrderMetrics] Starting job");

        try {
            const staleOrders = await prisma.order.groupBy({
                by: ["tenantUuid", "storeUuid"],
                where: {
                    status: "PREPARING",
                },
                _count: { uuid: true },
            });
        
            logWithContext("info", "[StaleOrderMetrics] Processing stores", {
                count: staleOrders.length,
            });

            for (const stat of staleOrders){
                await prisma.storeOpsMetrics.upsert({
                    where: {
                        tenantUuid_storeUuid: {
                            tenantUuid: stat.tenantUuid,
                            storeUuid: stat.storeUuid,
                        },
                    },
                    update: {
                        stalePreparingOrders: stat._count.uuid,
                        updatedAt: new Date(),
                    },
                    create: {
                        tenantUuid: stat.tenantUuid,
                        storeUuid: stat.storeUuid,
                        stalePreparingOrders: stat._count.uuid,
                    },
                });
            };

            logWithContext("info", "[StaleOrderMetrics] Job completed", {
                storesProcessed: staleOrders.length,
            });
        } catch (error: any) {
            logWithContext("error", "[StaleOrderMetrics] Job failed", {
                error: error.message,
            });
        
            throw error;
        }
    }
};