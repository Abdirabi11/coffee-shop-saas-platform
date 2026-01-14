import cron from "node-cron";
import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";


export async function runCohortRetention(){
    console.log("📊 Running cohort retention")

    const tenants= await prisma.tenant.findMany({
        select: {uuid: true, createdAt: true}
    });

    const cohorts= tenants.reduce<Record<string, string[]>>((acc, t)=>{
        const month= dayjs(t.createdAt).format("YYYY-MM");
        acc[month] ??= [];
        acc[month].push(t.uuid);
        return acc;
    }, {});

    for (const [cohortMonth, tenantUuids] of Object.entries(cohorts)){
        const cohortStart= dayjs(cohortMonth).startOf("month").toDate();
        const size= tenantUuids.length;

        if (size === 0) continue;

        const retention: Record<string, number>= {};

        for (const m of [1, 3, 6]){
            const checkDate= dayjs(cohortStart).add(m, "month").toDate();

            const activeCount= await prisma.subscription.count({
                where: {
                    tenantUuid: {in: tenantUuids},
                    status: {in: ["ACTIVE", "PAST_DUE"]},
                    startDate: {lte: checkDate}
                }
            });

            retention[`month_${m}`] = activeCount;
        };

        await  prisma.analyticsSnapshot.create({
            data: {
                type: "COHORT_RETENTION",
                period: cohortMonth,
                data: { cohortMonth, size, retention },
            }
        });
    };

    console.log("✅ Cohort retention snapshots saved");
};

export async function runTenantCohortGrowth(){
    console.log("📈 Running tenant cohort growth");

    const months= await prisma.tenant.findMany({
        select: { createdAt: true },
    });

    const uniqueMonths = [
        ...new Set(months.map(m => dayjs(m.createdAt).format("YYYY-MM"))),
    ];

    for(const month of uniqueMonths){
        const start = dayjs(month).startOf("month").toDate();
        const end = dayjs(start).add(1, "month").toDate();

        const newTenants= await prisma.tenant.count({
            where: {createdAt: {gte: start, lt: end}}
        });

        const activeAfter3Months= await prisma.subscription.count({
            where: {
                startDate: {gte: start, lt: end},
                status: { in: ["ACTIVE", "PAST_DUE"] },
            }
        });

        await prisma.analyticsSnapshot.create({
            data: {
                type: "TENANT_COHORT_GROWTH",
                period: month,
                data: { month, newTenants, activeAfter3Months },
            },
        })
        
    }
};

export async function runArpuLtv() {
    console.log("💰 Running ARPU / LTV");

    const period = dayjs().subtract(1, "month").format("YYYY-MM");

    const revenue= await prisma.payment.aggregate({
        where: {status: "PAID"},
        _sum: {amount: true},
    });

    const activeTenants= await prisma.subscription.count({
        where: {status: "ACTIVE"}
    });

    const arpu= activeTenants === 0 ? 0 : (revenue._sum.amount ?? 0) / activeTenants;
    const avgLifetimeMonths= 12;
    const ltv= arpu * avgLifetimeMonths;

    await prisma.analyticsSnapshot.create({
        data: {
            type: "ARPU_LTV",
            period,
            data: {
                arpu: Number(arpu.toFixed(2)),
                ltv: Number(ltv.toFixed(2)),
            },
        }
    });
};

export async function generateBillingSnapshots(){
    const subs= await prisma.subscription.findMany({
        where: {status: "ACTIVE"},
        include: { planVersion: true },
    });

    const month= dayjs().subtract(1, "month").format("YYYY-MM");

    for (const sub of subs){
        const addonsAmount= 0

        await prisma.billingSnapshot.create({
            data: {
                tenantUuid: sub.tenantUuid,
                subscriptionUuid: sub.uuid,
                planVersionUuid: sub.planVersionUuid,
                month,
                baseAmount: sub.planVersion.priceMonthly,
                addonsAmount,
                totalAmount: sub.planVersion.priceMonthly + addonsAmount
            }
        })
    }
};