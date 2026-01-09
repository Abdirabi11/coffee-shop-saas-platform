import prisma from "../../config/prisma.ts"

export const computeSuperAdminKPIs= async () =>{
    const [revenue, active, churned, trials, converted]= 
     await Promise.all([
        prisma.invoice.aggregate({
            _sum: {amount: true},
            where: { status: "PAID"}
        }),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.subscription.count({ where: { status: "CANCELED" } }),
        prisma.subscription.count({ where: { status: "TRIAL" } }),
        prisma.subscription.count({
            where: {status: "ACTIVE", startedAt: { not: null }}
        })
    ]); 
    const churnRate= active === 0 ? 0 : (churned / active) * 100;
    const trialConversionRate= trials === 0 ? 0 : (converted / trials) * 100;

    return {
        totalRevenue: revenue._sum.amount || 0,
        activeTenants: active,
        churnRate: Number(churnRate.toFixed(2)),
        trialConversionRate: Number(trialConversionRate.toFixed(2)),
    }
}