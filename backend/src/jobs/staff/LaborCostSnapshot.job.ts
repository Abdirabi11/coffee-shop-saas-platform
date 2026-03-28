import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { LaborCostTrackingService } from "../../services/staff/LaborCostTracking.service.ts";


export class LaborCostSnapshotJob {
  
    //Create hourly labor cost snapshots for all stores
    static async run() {
        logWithContext("info", "[LaborCostSnapshot] Starting hourly snapshot");

        try {
            const now = new Date();

            // Get all active stores
            const stores = await prisma.store.findMany({
                where: { isActive: true },
            });

            let processed = 0;
            let errors = 0;

            for (const store of stores) {
                try {
                await LaborCostTrackingService.calculateSnapshot({
                    storeUuid: store.uuid,
                    snapshotDate: now,
                    periodType: "HOURLY",
                });

                processed++;

                } catch (error: any) {
                    errors++;
                    logWithContext("error", "[LaborCostSnapshot] Failed to create snapshot", {
                        storeUuid: store.uuid,
                        error: error.message,
                    });
                }
            };

            logWithContext("info", "[LaborCostSnapshot] Completed", {
                total: stores.length,
                processed,
                errors,
            });

            return { processed, errors };

        } catch (error: any) {
            logWithContext("error", "[LaborCostSnapshot] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}
