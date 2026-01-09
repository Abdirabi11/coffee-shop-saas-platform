import dayjs from "dayjs";
import prisma from "../../lib/prisma.ts";

export async function getTenantRevenueAnalytics(
    tenantUuid: string
){
    const startDate= dayjs().subtract(12, "month").toDate();
    const payments= await prisma.payment.findMany({
        where: {
            tenantUuid,
            status: "SUCCESS",
            createdAt: { gte: startDate },
        }
    });

    const grouped: Record<string, number>={}

    for(const p of payments){
        const month= dayjs(p.createdAt).format("YYYY-MM");
        grouped[month] = (grouped[month] || 0) + p.amount;
    };

    return Object.entries(grouped)
     .sort(([a], [b]) => a.localeCompare(b))
     .map(([month, revenue]) => ({ month, revenue }));
} 