import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class CohortRetentionJob {
  static cronSchedule = "0 4 1 * *";
 
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[CohortRetention] Starting cohort retention analytics");
    
        try {
            const cohortMonths = await prisma.$queryRaw<{ month: string }[]>`
                SELECT DISTINCT TO_CHAR("createdAt", 'YYYY-MM') as month
                FROM "Tenant"
                ORDER BY month ASC
            `;
        
            let processed = 0;
            let skipped = 0;
        
            for (const { month } of cohortMonths) {
                const cohortStart = dayjs(month).startOf("month").toDate();
                const cohortEnd = dayjs(month).add(1, "month").startOf("month").toDate();
        
                try {
                    // Get tenants created in this cohort month
                    const cohortTenants = await prisma.tenant.findMany({
                        where: {
                            createdAt: { gte: cohortStart, lt: cohortEnd },
                        },
                        select: { uuid: true },
                    });
            
                    const size = cohortTenants.length;
                    if (size === 0) {
                        skipped++;
                        continue;
                    }
            
                    const tenantUuids = cohortTenants.map((t) => t.uuid);
            
                    // Calculate retention at 1, 3, 6, 12 month marks
                    const retention: Record<string, number> = {};
        
                    for (const monthMark of [1, 3, 6, 12]) {
                        const checkDate = dayjs(cohortStart).add(monthMark, "month").toDate();
            
                        // Only compute if check date is in the past
                        if (checkDate > new Date()) {
                            retention[`month_${monthMark}`] = -1; // Not yet available
                            retention[`month_${monthMark}_rate`] = -1;
                            continue;
                        }
            
                        const activeCount = await prisma.subscription.count({
                            where: {
                                tenantUuid: { in: tenantUuids },
                                status: { in: ["ACTIVE", "PAST_DUE"] },
                                startDate: { lte: checkDate },
                                OR: [
                                    { endDate: null },
                                    { endDate: { gte: checkDate } },
                                ],
                            },
                        });
            
                        retention[`month_${monthMark}`] = activeCount;
                        retention[`month_${monthMark}_rate`] = Number(
                            ((activeCount / size) * 100).toFixed(2)
                        );
                    }
        
                    // Upsert to avoid duplicates on re-runs
                    await prisma.analyticsSnapshot.upsert({
                        where: {
                            tenantUuid_storeUuid_type_granularity_periodStart: {
                                tenantUuid: null as any, // Platform level
                                storeUuid: null as any,
                                type: "COHORT_RETENTION" as any,
                                granularity: "MONTHLY",
                                periodStart: cohortStart,
                            },
                        },
                        update: {
                            metrics: { cohort: month, size, retention },
                            status: "COMPLETED",
                            calculatedAt: new Date(),
                        },
                        create: {
                            type: "COHORT_RETENTION" as any,
                            granularity: "MONTHLY",
                            periodStart: cohortStart,
                            periodEnd: cohortEnd,
                            metrics: { cohort: month, size, retention },
                            status: "COMPLETED",
                        },
                    });
            
                    processed++;
                } catch (cohortError: any) {
                    logWithContext("error", "[CohortRetention] Failed for cohort", {
                        month,
                        error: cohortError.message,
                    });
                }
            }
        
            const duration = Date.now() - startTime;
            logWithContext("info", "[CohortRetention] Completed", {
                processed,
                skipped,
                totalMonths: cohortMonths.length,
                durationMs: duration,
            });
        
            return { processed, skipped };
        } catch (error: any) {
            logWithContext("error", "[CohortRetention] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}