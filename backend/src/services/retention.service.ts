import prisma from "../config/prisma.ts"

export class RetentionService{
    static async computeRetentionForTenant(tenantUuid: string){
        const subscriptions= await prisma.subscription.findMany({
            where: {tenantUuid},
            select: {
                uuid: true,
                createdAt: true,
                status: true,
            }
        });

        const cohorts= new Map<string, typeof subscriptions>();
        for(const sub of subscriptions){
            const cohortKey= sub.createdAt.toISOString().slice(0, 7);
            if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, []);
            cohorts.get(cohortKey)!.push(sub);
        };

        for(const [cohort, subs] of cohorts){
            const total= subs.length
            const active= subs.filter(s => s.status === "ACTIVE").length;

            await prisma.subscriptionRetention.create({
                data: {
                    tenantUuid,
                    cohortMonth: new Date(`${cohort}-01`),
                    totalCount: total,
                    activeCount: active,
                    retentionRate: total === 0 ? 0 : active / total,
                }
            })
        }
    };
};

