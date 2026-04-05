import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { TipsAndCommissionService } from "../../services/staff/TipsAndCommission.service.ts";

export class TipPoolCalculationJob {
  
    //Calculate tip pools for all stores (yesterday)
    static async run() {
        const startTime = Date.now();
        
        logWithContext("info", "[TipPoolJob] Starting daily tip pool calculation");

        try {
            const yesterday = dayjs().subtract(1, "day");
            const periodStart = yesterday.startOf("day").toDate();
            const periodEnd = yesterday.endOf("day").toDate();

            // Get all active stores
            const stores = await prisma.store.findMany({
                where: { active: true },
            });

            let processed = 0;
            let errors = 0;

            for (const store of stores) {
                try {
                    await TipsAndCommissionService.calculateTipPool({
                        storeUuid: store.uuid,
                        periodStart,
                        periodEnd,
                        periodType: "DAILY",
                    });

                    processed++;

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[TipPoolJob] Failed to calculate pool", {
                        storeUuid: store.uuid,
                        error: error.message,
                    });
                }
            };

            const duration = Date.now() - startTime;

            logWithContext("info", "[TipPoolJob] Completed", {
                total: stores.length,
                processed,
                errors,
                durationMs: duration,
            });

            return { processed, errors };

        } catch (error: any) {
            logWithContext("error", "[TipPoolJob] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}
