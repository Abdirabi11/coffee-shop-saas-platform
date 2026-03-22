import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class IdempotencyKeyCleanupJob {
    static cronSchedule = "0 3 * * 0";
    
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[IdempotencyCleanup] Starting");
    
        try {
            const result = await prisma.idempotencyKey.deleteMany({
                where: {
                    createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            });
        
            const duration = Date.now() - startTime;
            logWithContext("info", "[IdempotencyCleanup] Completed", {
                deletedCount: result.count,
                durationMs: duration,
            });
    
            MetricsService.increment("idempotency.keys.deleted", result.count);
            return { deleted: result.count };
        } catch (error: any) {
            logWithContext("error", "[IdempotencyCleanup] Failed", {
                error: error.message,
            });
            throw error;
        }
    }
}