import cron from "node-cron";
import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";


export const churnCron= ()=>{
    cron.schedule("0 3 * * *", async () => {
        console.log("📉 Running nightly churn analytics");

        const period = dayjs().subtract(1, "month").format("YYYY-MM");
        const start = dayjs(period).startOf("month").toDate();
        const end = dayjs(period).endOf("month").toDate();

        const tenantsAtStart= await prisma.subscription.count({
            where: {
                status: "ACTIVE",
                startDate: { lte: start },
            }
        });

        const churnedTenants= await prisma.subscription.count({
            where: {
                status: {in: ["CANCELED", "EXPIRED"]},
                endDate: { gte: start, lte: end },
            }
        });

        const churnRate=
            tenantsAtStart === 0 ? 0 : Number(((churnedTenants / tenantsAtStart) *100).toFixed(2));
        
        const retentionRate= Number((100 - churnRate).toFixed(2));

        await prisma.analyticsSnapshot.create({
            data: {
                type: "CHURN",
                period,
                data:{
                    tenantsAtStart,
                    churnedTenants,
                    churnRate,
                    retentionRate,
                }
            }
        });
        console.log("✅ Churn snapshot saved");
    })
};



export const tenantCohortGrowthCron= ()=>{
    cron.schedule("45 3 * * *", async()=>{
        const months= await prisma.tenant.groupBy({
            by: ["createdAt"]
        });

        for(const m of months){
            const month= dayjs(m.createdAt).format("YYYY-MM")
            const start= dayjs(month).startOf("month").toDate();
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
    })
};

export const arpuLtvCron= ()=>{
    cron.schedule("15 4 * * *", async ()=>{
        const totalRevenue= await prisma.payment.aggregate({
            where: {status: "SUCCESS"},
            _sum: {amount: true},
        });

        const activeTenants= await prisma.subscription.count({
            where: {status: "ACTIVE"}
        });

        const arpu= activeTenants === 0 ? 0 : (totalRevenue._sum.amount ?? 0) / activeTenants;
        const avgLifetimeMonths= 12;
        const ltv= arpu * avgLifetimeMonths;

        await prisma.analyticsSnapshot.create({
            data: {
                type: "ARPU_LTV",
                period: dayjs().format("YYYY-MM"),
                data: {
                    arpu: Number(arpu.toFixed(2)),
                    ltv: Number(ltv.toFixed(2)),
                },
            }
        })
    })
};

export const generateBillingSnapshots= async ()=>{
    const activeSubscriptions= await prisma.subscription.findMany({
        where: {status: "ACTIVE"},
        include: {
            planVersion: true
        }
    });

    for (const sub of activeSubscriptions){
        const addonsTotal= calculateAddons(sub.tenantUuid);

        await prisma.billingSnapshot.create({
            data: {
                    tenantUuid: sub.tenantUuid,
        subscriptionUuid: sub.uuid,
        planVersionUuid: sub.planVersionUuid,
        month: dayjs().subtract(1, "month").format("YYYY-MM"),
        baseAmount: sub.planVersion.priceMonthly,
        addonsAmount: addonsTotal,
        totalAmount: sub.planVersion.priceMonthly + addonsTotal
            }
        })
    }
};