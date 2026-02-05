import dayjs from "dayjs";
import { prisma } from "../../config/prisma.ts"

export class ChurnAnalyticsJob{
    static async run() {
        console.log("📉 Running churn analytics");
    
        const period = dayjs().subtract(1, "month").format("YYYY-MM");
        const start = dayjs(period).startOf("month").toDate();
        const end = dayjs(period).endOf("month").toDate();

        const tenantsAtStart = await prisma.subscription.count({
            where: {
                status: "ACTIVE",
                startDate: { lte: start },
            },
        });
        const churnedTenants = await prisma.subscription.count({
            where: {
                status: { in: ["CANCELLED", "EXPIRED"] },
                endDate: { gte: start, lte: end },
            },
        });
  
      // Calculate rates
      const churnRate =
        tenantsAtStart === 0
          ? 0
          : Number(((churnedTenants / tenantsAtStart) * 100).toFixed(2));
  
        const retentionRate = Number((100 - churnRate).toFixed(2));
  
        await prisma.analyticsSnapshot.create({
            data: {
            type: "CHURN",
            granularity: "MONTHLY", 
            periodStart: start,  
            periodEnd: end,
            metrics: {
                tenantsAtStart,
                churnedTenants,
                churnRate,
                retentionRate,
            },
            status: "COMPLETED", 
            },
        });
  
        console.log(
            `✅ Churn snapshot saved - Rate: ${churnRate}%, Retention: ${retentionRate}%`
        );
  
        return {
            period,
            tenantsAtStart,
            churnedTenants,
            churnRate,
            retentionRate,
        };
    }
};