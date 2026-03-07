import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"
import { PerformanceTrackingService } from "../../services/staff/PerformanceTracking.service.ts";


export class PerformanceCalculationJob {
  
    //Calculate daily performance for all active staff
    static async run() {
        const startTime = Date.now();
        
        logWithContext("info", "[PerformanceJob] Starting daily performance calculation");

        try {
            // Get yesterday's date
            const yesterday = dayjs().subtract(1, "day").toDate();

            // Get all active staff members
            const userStores = await prisma.userStore.findMany({
                where: {
                    isActive: true,
                },
                select: {
                    userUuid: true,
                    storeUuid: true,
                },
            });

            let processed = 0;
            let errors = 0;

            for (const userStore of userStores) {
                try {
                    await PerformanceTrackingService.calculateDailyPerformance({
                        userUuid: userStore.userUuid,
                        storeUuid: userStore.storeUuid,
                        date: yesterday,
                    });

                    processed++;

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[PerformanceJob] Failed to calculate performance", {
                        userUuid: userStore.userUuid,
                        storeUuid: userStore.storeUuid,
                        error: error.message,
                    });
                }
            }

            const duration = Date.now() - startTime;

            logWithContext("info", "[PerformanceJob] Completed", {
                total: userStores.length,
                processed,
                errors,
                durationMs: duration,
            });

            return { processed, errors };

        } catch (error: any) {
            logWithContext("error", "[PerformanceJob] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}