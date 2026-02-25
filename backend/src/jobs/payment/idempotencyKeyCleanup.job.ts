import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class IdempotencyKeyCleanupJob{
    static async run(){
        const startTime = Date.now();
        logWithContext("info", "[IdempotencyKeyCleanup] Starting cleanup job");

        try {
            // Delete keys older than 7 days
            const result = await prisma.idempotencyKey.deleteMany({
                where: {
                    createdAt: {
                        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            });

            const duration = Date.now() - startTime;

            logWithContext("info", "[IdempotencyKeyCleanup] Job completed", {
                deletedCount: result.count,
                durationMs: duration,
            });

            //double
            MetricsService.timing("idempotency.cleanup.duration", duration);
            MetricsService.increment("idempotency.keys.deleted", result.count);

        } catch (error: any) {
            logWithContext("error", "[IdempotencyKeyCleanup] Job failed", {
                error: error.message,
                stack: error.stack,
            });

            MetricsService.increment("idempotency.cleanup.error", 1);
            throw error;
        }
    }
}