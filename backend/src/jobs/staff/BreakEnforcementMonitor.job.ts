import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { BreakEnforcementService } from "../../services/staff/BreakEnforcement.service.ts";

export class BreakEnforcementMonitorJob {
  
    //Monitor breaks for all active time entries
    static async run() {
        logWithContext("info", "[BreakMonitor] Starting break enforcement monitor");

        try {
            // Get all active stores
            const stores = await prisma.store.findMany({
                where: { active: true },
            });

            let totalMonitored = 0;
            let totalReminders = 0;
            let totalViolations = 0;

            for (const store of stores) {
                try {
                    const result = await BreakEnforcementService.monitorActiveEntries(store.uuid);

                    totalMonitored += result.monitored;
                    totalReminders += result.remindersNeeded;
                    totalViolations += result.violationsCreated;

                } catch (error: any) {
                    logWithContext("error", "[BreakMonitor] Failed to monitor store", {
                        storeUuid: store.uuid,
                        error: error.message,
                    });
                }
            };

            logWithContext("info", "[BreakMonitor] Completed", {
                stores: stores.length,
                monitored: totalMonitored,
                reminders: totalReminders,
                violations: totalViolations,
            });

            return { totalMonitored, totalReminders, totalViolations };

        } catch (error: any) {
            logWithContext("error", "[BreakMonitor] Job failed", {
                error: error.message,
            });
            throw error;
        }
    }
}