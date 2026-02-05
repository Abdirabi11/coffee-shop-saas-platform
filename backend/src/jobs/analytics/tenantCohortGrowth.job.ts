import { prisma } from "../../config/prisma.ts"
import dayjs from "dayjs";

export class TenantCohortGrowthJob {
    static async run() {
        console.log("📈 Running tenant cohort growth analytics");

        const months = await prisma.tenant.groupBy({
            by: ["createdAt"],
        });

        let processed = 0;

        for (const m of months) {
            const month = dayjs(m.createdAt).format("YYYY-MM");
            const start = dayjs(month).startOf("month").toDate();
            const end = dayjs(start).add(1, "month").toDate();

            const newTenants = await prisma.tenant.count({
            where: { createdAt: { gte: start, lt: end } },
            });

            const threeMonthsLater = dayjs(start).add(3, "month").toDate();
            const activeAfter3Months = await prisma.subscription.count({
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

            const retentionRate =
            newTenants === 0
                ? 0
                : Number(((activeAfter3Months / newTenants) * 100).toFixed(2));

            await prisma.analyticsSnapshot.create({
            data: {
                type: "TENANT_COHORT_GROWTH",
                granularity: "MONTHLY",
                periodStart: start,
                periodEnd: end,
                metrics: {
                month,
                newTenants,
                activeAfter3Months,
                retentionRate,
                },
                status: "COMPLETED",
            },
            });

            processed++;
        };
        console.log(`✅ Tenant cohort growth: processed ${processed} months`);
        return { processed };
    }
}