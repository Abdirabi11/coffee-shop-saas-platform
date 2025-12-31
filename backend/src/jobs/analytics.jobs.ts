import prisma from "../config/prisma.ts"
import dayjs from "dayjs";

export async function monthlyRevenueAnalytics(){
    console.log("📊 Running monthly revenue analytics");

    const period= dayjs().subtract(1, "month").format("YYYY-MM");
    const start= dayjs(period).startOf("month").toDate();
    const end= dayjs(period).endOf("month").toDate();

    const revenue= await prisma.invoice.aggregate({
        where: {
            status: "PAID",
            paidAt: { gte: start, lte: end },
        },
        _sum: {amount: true}
    });

    await prisma.analyticsSnapshot.create({
        data: {
            type: "MONTHLY_REVENUE",
            period,
            data: {
                revenue: revenue._sum.amount ?? 0,
            } 
        }
    });

    console.log("✅ Revenue analytics saved");
}