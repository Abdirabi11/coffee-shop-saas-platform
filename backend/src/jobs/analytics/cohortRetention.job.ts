import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";

export class CohortRetentionJob{
    static async run() {
        console.log("📊 Running cohort retention analytics");
        const cohorts=  await prisma.tenant.groupBy({
            by: ["createdAt"],
        });

        let processed = 0;

        for(const cohort of cohorts ){
            const cohortMonth = dayjs(cohort.createdAt).format("YYYY-MM");
            const cohortStart = dayjs(cohortMonth).startOf("month").toDate();
            const cohortEnd = dayjs(cohortStart).add(1, "month").toDate();

            const cohortTenants= await prisma.tenant.findMany({
                where: {
                    createdAt: {
                        gte: cohortStart,
                        lt: cohortEnd,
                    },
                },
                select: { uuid: true },
            });

            const size= cohortTenants.length
            if(size === 0) continue
            
            const tenantUuids = cohortTenants.map((t) => t.uuid);

            // Calculating retention at different periods
            const retention: Record<string, number> = {};

            for(const month of [1, 3, 6, 12]){
                const checkDate= dayjs(cohortStart).add(month, "month").toDate();

                const activeCount= await prisma.subscription.count({
                    where: {
                        tenantUuid: {in: tenantUuids},
                        status: { in: ["ACTIVE", "PAST_DUE"] },
                        startDate: { lte: checkDate },
                        OR: [
                            { endDate: null },
                            { endDate: { gte: checkDate } },
                        ],
                    },
                });
                retention[`month_${month}`] = activeCount;
                retention[`month_${month}_rate`] = Number(
                    ((activeCount / size) * 100).toFixed(2)
                );
            };
            // Store snapshot
            await prisma.analyticsSnapshot.create({
                data: {
                    type: "COHORT_RETENTION",
                    granularity: "MONTHLY",
                    periodStart: cohortStart,
                    periodEnd: cohortEnd,
                    metrics: {
                      cohort: cohortMonth,
                      size,
                      retention,
                    },
                    status: "COMPLETED",
                }
            });

            processed++;
        };
        console.log("✅ Cohort retention snapshots saved");
        return { processed };
    }
};