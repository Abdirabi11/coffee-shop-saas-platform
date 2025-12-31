import cron from "node-cron";
import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";

export const analyticsCron= ()=>{
    cron.schedule("0 2 * * *", async () => {
        console.log("📊 Running nightly analytics job");

        const start= dayjs().startOf("month");
        const end= dayjs().endOf("month");

        const revenue= await prisma.invoice.aggregate({
            where: {
                status: "PAID",
                paidAt: {
                    gte: start.toDate(),
                    lte: end.toDate(),
                }
            },
            _sum: { amount: true },
        });

        await prisma.analyticsSnapshot.create({
            data: {
                type: 'MONTHLY_REVENUE',
                period: start.format("YYYY-MM"),
                data: {
                    revenue: revenue._sum.amount ?? 0,
                },
            }
        });

        console.log("✅ Analytics snapshot saved");
    })
};

export async function runChurnAnalytics(){
    console.log("📉 Running churn analytics");

    const period = dayjs().subtract(1, "month").format("YYYY-MM");
    const start = dayjs(period).startOf("month").toDate();
    const end = dayjs(period).endOf("month").toDate();

    const tenantsAtStart= await prisma.subscription.count({
        where: {
            startDate: {lte: start},
            status: { in: ["ACTIVE", "PAST_DUE"] },
        }
    });

    const churnedTenants= await prisma.subscription.count({
        where: {
            status: {in: ["CANCELED", "EXPIRED"]},
            endDate: {gte: start, lte: end}
        }
    });

    const churnRate= tenantsAtStart === 0 ? 0 : Number (((churnedTenants / tenantsAtStart) * 100).toFixed(2));
    const retentionRate= Number((100 - churnRate).toFixed(2));

    await prisma.analyticsSnapshot.create({
        data: {
            type: "CHURN",
            period,
            data: {
                tenantsAtStart,
                churnedTenants,
                churnRate,
                retentionRate,
            }
        }
    });
    console.log("✅ Churn snapshot saved");
}