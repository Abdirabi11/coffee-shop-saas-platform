import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { TipsAndCommissionService } from "../../services/staff/TipsAndCommission.service.ts";


export class CommissionCalculationJob {
  
    //Calculate monthly commissions (runs on 1st of month)
    static async run() {
        logWithContext("info", "[CommissionJob] Starting monthly commission calculation");

        try {
            const lastMonth = dayjs().subtract(1, "month");
            const periodStart = lastMonth.startOf("month").toDate();
            const periodEnd = lastMonth.endOf("month").toDate();

            // Get all active staff with commission enabled
            const userStores = await prisma.userStore.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    user: true,
                    store: true,
                },
            });

            let processed = 0;
            let errors = 0;

            for (const userStore of userStores) {
                try {
                    // Default commission rate: 2.5% of sales
                    // Can be customized per staff member
                    const commissionRate = 2.5;
                    
                    // Optional: Get sales target from user metadata
                    const salesTarget = undefined; // Can be configured

                    await TipsAndCommissionService.calculateCommission({
                        userUuid: userStore.userUuid,
                        storeUuid: userStore.storeUuid,
                        periodStart,
                        periodEnd,
                        periodType: "MONTHLY",
                        commissionRate,
                        salesTarget,
                    });

                    processed++;

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[CommissionJob] Failed to calculate commission", {
                        userUuid: userStore.userUuid,
                        storeUuid: userStore.storeUuid,
                        error: error.message,
                    });
                }
            }

            logWithContext("info", "[CommissionJob] Completed", {
                total: userStores.length,
                processed,
                errors,
            });

            return { processed, errors };

        } catch (error: any) {
            logWithContext("error", "[CommissionJob] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}
