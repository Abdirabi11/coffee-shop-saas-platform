import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";

export class FraudEventCleanupJob {
  
    /**
     * Archive old fraud events
     * Run daily at 4:00 AM
    */
    static async run() {
        const startTime = Date.now();
      
        logWithContext("info", "[FraudEventCleanup] Starting cleanup");
  
        try {
            // Move resolved fraud events older than 1 year to archive
            const archiveCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    
            // For now, just mark as resolved if not already
            const result = await prisma.fraudEvent.updateMany({
                where: {
                    createdAt: { lt: archiveCutoff },
                    status: "PENDING",
                },
                data: {
                    status: "RESOLVED",
                    resolution: "Auto-archived after 1 year",
                },
            });
    
            const duration = Date.now() - startTime;
    
            logWithContext("info", "[FraudEventCleanup] Cleanup completed", {
                archivedEvents: result.count,
                durationMs: duration,
            });
    
            MetricsService.increment("fraud.cleanup.archived", result.count);
            MetricsService.timing("fraud.cleanup.duration", duration);
    
            return { archivedEvents: result.count };
    
        } catch (error: any) {
            logWithContext("error", "[FraudEventCleanup] Cleanup failed", {
                error: error.message,
            });
    
            MetricsService.increment("fraud.cleanup.error", 1);
    
            throw error;
        }
    }
}
  