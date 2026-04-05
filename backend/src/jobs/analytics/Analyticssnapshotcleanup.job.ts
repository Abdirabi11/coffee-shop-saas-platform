import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


// Retention policy: how long to keep each snapshot type
const RETENTION_MONTHS: Record<string, number> = {
    MONTHLY_REVENUE: 36,       // 3 years
    CHURN: 36,                 // 3 years
    ARPU_LTV: 36,              // 3 years
    COHORT_RETENTION: 24,      // 2 years
    TENANT_COHORT_GROWTH: 24,  // 2 years
    BILLING: 24,               // 2 years
    
    // Operational metrics — shorter retention
    REVENUE: 18,               // 1.5 years
    ORDERS: 18,
    CUSTOMERS: 18,
    PRODUCTS: 12,              // 1 year
    INVENTORY: 12,
    PERFORMANCE: 12,
    ENGAGEMENT: 12,
    CONVERSION: 12,
    RETENTION: 18,
};
 
const DEFAULT_RETENTION_MONTHS = 12;
 
export class AnalyticsSnapshotCleanupJob {
    static cronSchedule = "0 3 1 * *"; // 1st of month at 03:00
 
    static async execute() {
        const startTime = Date.now();
        logWithContext("info", "[AnalyticsSnapshotCleanup] Starting");
    
        try {
            let totalDeleted = 0;
            const results: { type: string; deleted: number; cutoff: string }[] = [];
        
            // Get all distinct snapshot types in the DB
            const types = await prisma.analyticsSnapshot.findMany({
                select: { type: true },
                distinct: ["type"],
            });
        
            for (const { type } of types) {
                const retentionMonths = RETENTION_MONTHS[type] ?? DEFAULT_RETENTION_MONTHS;
                const cutoff = dayjs().subtract(retentionMonths, "month").toDate();
        
                try {
                    const result = await prisma.analyticsSnapshot.deleteMany({
                        where: {
                            type: type as any,
                            periodStart: { lt: cutoff },
                        },
                    });
            
                    if (result.count > 0) {
                        results.push({
                            type,
                            deleted: result.count,
                            cutoff: cutoff.toISOString(),
                        });
                        totalDeleted += result.count;
                    };
                } catch (typeError: any) {
                    logWithContext("error", "[AnalyticsSnapshotCleanup] Failed for type", {
                        type,
                        error: typeError.message,
                    });
                }
            }
        
            // Also clean failed/stale snapshots older than 7 days
            const staleCutoff = dayjs().subtract(7, "day").toDate();
            const staleResult = await prisma.analyticsSnapshot.deleteMany({
                where: {
                    status: { in: ["FAILED", "STALE"] },
                    createdAt: { lt: staleCutoff },
                },
            });
        
            if (staleResult.count > 0) {
                results.push({
                    type: "FAILED/STALE",
                    deleted: staleResult.count,
                    cutoff: staleCutoff.toISOString(),
                });
                totalDeleted += staleResult.count;
            }
        
            const duration = Date.now() - startTime;
            MetricsService.increment("analytics_snapshot_cleanup_completed", {
                deleted: totalDeleted,
            });
        
            logWithContext("info", "[AnalyticsSnapshotCleanup] Completed", {
                totalDeleted,
                types: results.length,
                details: results,
                durationMs: duration,
            });
        
            return { totalDeleted, details: results };
        } catch (error: any) {
            logWithContext("error", "[AnalyticsSnapshotCleanup] Fatal error", {
                error: error.message,
            });
            MetricsService.increment("analytics_snapshot_cleanup_failed");
            throw error;
        }
    }
}