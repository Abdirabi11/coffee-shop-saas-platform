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

    await prisma.analyticsSnapshot.upsert({ //create
        data: {
            type_period: {
                type: "MONTHLY_REVENUE",
                period,
            },
            update: {
                data: { revenue: revenue._sum.amount ?? 0 },
            },
            create: {
                type: "MONTHLY_REVENUE",
                period,
                data: { revenue: revenue._sum.amount ?? 0 },
            },
        }
    });

    console.log("✅ Revenue analytics saved");
};

export async function runChurnAnalytics(){
    console.log("📉 Running churn analytics");

    const period = dayjs().subtract(1, "month").format("YYYY-MM");
    const start = dayjs(period).startOf("month").toDate();
    const end = dayjs(period).endOf("month").toDate();

    const tenantsAtPeriodStart= await prisma.subscription.count({
        where: {
            startDate: {lte: start},
            status: {in: ["ACTIVE", "PAST_DUE"]}
        }
    });

    const churnedStatus= await prisma.subscription.count({
        where: {
            status: {in: ["CANCELED", "EXPIRED"]},
            endDate: {gte: start, lte: end}
        }
    });

    const churnRate= tenantsAtPeriodStart === 0 ? 0 : Number(((churnedStatus / tenantsAtPeriodStart) * 100).toFixed(2));
    const retentionRate= Number((100 - churnRate).toFixed(2));

    await prisma.analyticsSnapshot.create({
        data: {
            type: "CHURN",
            period,
            data: {
                tenantsAtPeriodStart,
                churnedStatus,
                churnRate,
                retentionRate,
            }
        }
    });
    console.log("✅ Churn snapshot saved");
};

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
        const checkDate = dayjs(start).add(3, "month").toDate();
        const end = dayjs(start).add(1, "month").toDate();

        const newTenants= await prisma.tenant.count({
            where: {createdAt: {gte: start, lt: end}}
        });

        const activeAfter3Months= await prisma.subscription.count({
            where: {
                startDate: { lte: checkDate },
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

    const churnSnapshot= await prisma.analyticsSnapshot.findFirst({
        where: {
            type: "CHURN",
            period
        },
        orderBy: { createdAt: "desc" }
    });

    const churnRatePercent= churnSnapshot?.data?.churnRate ?? 0;
    const churnRate= churnRatePercent / 100
    const ltv= churnRate === 0 ? arpu * 12 : arpu / churnRate;

    await prisma.analyticsSnapshot.upsert({
        where: {
            type_period: {
                type: "ARPU_LTV",
                period,
            },
        },
        update: {
            data: {
                arpu: Number(arpu.toFixed(2)),
                ltv: Number(ltv.toFixed(2)),
                churnRate: churnRatePercent,
            },
        },
        create: {
            type: "ARPU_LTV",
            period,
            data: {
                arpu: Number(arpu.toFixed(2)),
                ltv: Number(ltv.toFixed(2)),
                churnRate: churnRatePercent,
            }
        }
    });
    console.log("✅ ARPU / LTV snapshot saved");
};