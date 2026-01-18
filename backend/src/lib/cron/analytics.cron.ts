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