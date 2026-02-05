import dayjs from "dayjs";
import { prisma } from "../../config/prisma.ts"

export class ArpuLtvJob {
    static async run() {
        console.log("💰 Running ARPU & LTV analytics");

        const currentMonth = dayjs().format("YYYY-MM");
        const monthStart = dayjs().startOf("month").toDate();
        const monthEnd = dayjs().endOf("month").toDate();

        const totalRevenue = await prisma.payment.aggregate({
            where: {
                status: "COMPLETED", 
                createdAt: { gte: monthStart, lte: monthEnd },
            },
            _sum: { amount: true },
        });

        const activeTenants = await prisma.subscription.count({
            where: { status: "ACTIVE" },
        });

        const arpu =
        activeTenants === 0
            ? 0
            : (totalRevenue._sum.amount ?? 0) / activeTenants;

        const avgLifetime = await this.calculateAvgLifetime();
        const ltv = arpu * avgLifetime;
        const metrics = await this.calculateAdditionalMetrics();

        // Store snapshot
        await prisma.analyticsSnapshot.create({
        data: {
            type: "ARPU_LTV",
            granularity: "MONTHLY",
            periodStart: monthStart,
            periodEnd: monthEnd,
            metrics: {
                arpu: Number(arpu.toFixed(2)),
                ltv: Number(ltv.toFixed(2)),
                avgLifetimeMonths: avgLifetime,
                activeTenants,
                totalRevenue: totalRevenue._sum.amount ?? 0,
                ...metrics,
            },
            status: "COMPLETED",
        },
    });

    console.log(`✅ ARPU: $${arpu.toFixed(2)}, LTV: $${ltv.toFixed(2)}`);

    return {
        arpu: Number(arpu.toFixed(2)),
        ltv: Number(ltv.toFixed(2)),
        avgLifetimeMonths: avgLifetime,
    };
    }

    private static async calculateAvgLifetime(): Promise<number> {
        const churnedSubs = await prisma.subscription.findMany({
        where: {
            status: { in: ["CANCELLED", "EXPIRED"] },
            endDate: { not: null },
        },
        select: {
            startDate: true,
            endDate: true,
        },
        });

        if (churnedSubs.length === 0) {
            return 12; 
        }

        const totalMonths = churnedSubs.reduce((sum, sub) => {
            const start = dayjs(sub.startDate);
            const end = dayjs(sub.endDate);
            const months = end.diff(start, "month");
            return sum + months;
        }, 0);

        return Math.max(1, Math.round(totalMonths / churnedSubs.length));
    }

    private static async calculateAdditionalMetrics() {
        const byPlan = await prisma.subscription.groupBy({
            by: ["planUuid"],
            where: { status: "ACTIVE" },
            _count: { uuid: true },
        });

        const avgSubValue = await prisma.subscription.aggregate({
            where: { status: "ACTIVE" },
            _avg: { amount: true },
        });

        return {
            activePlanDistribution: byPlan,
            avgSubscriptionValue: avgSubValue._avg.amount ?? 0,
        };
    }
}