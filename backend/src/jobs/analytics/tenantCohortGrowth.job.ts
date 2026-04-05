import { prisma } from "../../config/prisma.ts"
import dayjs from "dayjs";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class TenantCohortGrowthJob {
    static cronSchedule = "30 4 1 * *";
 
    static async run() {
        const startTime = Date.now();
        logWithContext("info", "[TenantCohortGrowth] Starting");
    
        try {
            const cohortMonths = await prisma.$queryRaw<{ month: string }[]>`
                SELECT DISTINCT TO_CHAR("createdAt", 'YYYY-MM') as month
                FROM "Tenant"
                ORDER BY month ASC
            `;
        
            let processed = 0;
        
            for (const { month } of cohortMonths) {
                const start = dayjs(month).startOf("month").toDate();
                const end = dayjs(month).add(1, "month").startOf("month").toDate();
        
                try {
                    const newTenants = await prisma.tenant.count({
                        where: { createdAt: { gte: start, lt: end } },
                    });
            
                    if (newTenants === 0) continue;
            
                    const threeMonthsLater = dayjs(start).add(3, "month").toDate();
            
                    // Only compute 3-month retention if that date is in the past
                    let activeAfter3Months = 0;
                    let retentionRate = -1; // -1 = not yet available
        
                    if (threeMonthsLater <= new Date()) {
                        activeAfter3Months = await prisma.subscription.count({
                        where: {
                            tenant: {
                            createdAt: { gte: start, lt: end },
                            },
                            status: { in: ["ACTIVE", "PAST_DUE"] },
                            startDate: { lte: threeMonthsLater },
                            OR: [
                            { endDate: null },
                            { endDate: { gte: threeMonthsLater } },
                            ],
                        },
                        });
            
                        retentionRate = Number(
                            ((activeAfter3Months / newTenants) * 100).toFixed(2)
                        );
                    };
        
                    // Upsert to avoid duplicates
                    await prisma.analyticsSnapshot.upsert({
                        where: {
                            tenantUuid_storeUuid_type_granularity_periodStart: {
                                tenantUuid: null as any,
                                storeUuid: null as any,
                                type: "TENANT_COHORT_GROWTH" as any,
                                granularity: "MONTHLY",
                                periodStart: start,
                            },
                        },
                        update: {
                            metrics: { month, newTenants, activeAfter3Months, retentionRate },
                            status: "COMPLETED",
                            calculatedAt: new Date(),
                        },
                        create: {
                            type: "TENANT_COHORT_GROWTH" as any,
                            granularity: "MONTHLY",
                            periodStart: start,
                            periodEnd: end,
                            metrics: { month, newTenants, activeAfter3Months, retentionRate },
                            status: "COMPLETED",
                        },
                    });
            
                    processed++;
                } catch (monthError: any) {
                    logWithContext("error", "[TenantCohortGrowth] Failed for month", {
                        month,
                        error: monthError.message,
                    });
                }
            }
        
            const duration = Date.now() - startTime;
            logWithContext("info", "[TenantCohortGrowth] Completed", {
                processed,
                totalMonths: cohortMonths.length,
                durationMs: duration,
            });
        
            return { processed };
        } catch (error: any) {
            logWithContext("error", "[TenantCohortGrowth] Fatal error", {
                error: error.message,
            });
            throw error;
        }
    }
}