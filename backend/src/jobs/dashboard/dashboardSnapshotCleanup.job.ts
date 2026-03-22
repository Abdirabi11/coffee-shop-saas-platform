import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import prisma from "../../config/prisma.ts"

export class DashboardSnapshotCleanupJob {
    static cronSchedule = "0 2 1 * *";
    
    static async execute() {
        logWithContext("info", "[SnapshotCleanup] Starting");
    
        try {
            const cutoff = dayjs().subtract(2, "year").toDate();
        
            const result = await prisma.dashboardSnapshot.deleteMany({
                where: { date: { lt: cutoff } },
            });
        
            logWithContext("info", "[SnapshotCleanup] Completed", {
                deletedSnapshots: result.count,
                cutoffDate: cutoff.toISOString(),
            });
        } catch (error: any) {
            logWithContext("error", "[SnapshotCleanup] Failed", {
                error: error.message,
            });
        }
    }
}