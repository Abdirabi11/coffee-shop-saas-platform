import prisma from "../config/prisma.ts"
import { validatePlanDowngrade } from "../planDowngrade.service.js";


export const listActivePlans= async ()=>{
    return prisma.plan.findMany({
        where: {isActive: true},
        include: {
            versions: {
                orderBy: { version: "desc"},
                take: 1,
            }
        },
        orderBy: { price: "asc"}
    })
};

export const createPlan= async (
    name: string,
    description: string,
    actorUuid: string,
    req: any
)=>{
    const existingPlan= await prisma.plan.findUniqe({ where: { name }})
    if(existingPlan){
        throw new Error("Plan already exists");
    };

    const plan= await prisma.plan.create({
        data: { name, description, isActive: true }
    });

    await prisma.auditLog.create({
        data: {
            actorUuid,
            action: "PLAN_CREATED",
            targetType: "PLAN",
            targetUuid: plan.uuid,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        }
    });
    return plan;
};

export const updatePlanService= async (
    planUuid: string,
    data: { name?: string; description?: string },
    actor: { userUuid: string; ip?: string; userAgent?: string }
)=>{
    const plan= await prisma.plan.findUniqe({
        where: {uuid: planUuid}
    });
    if (!plan) {
        throw new Error("Plan not found");
    };

    const updated= await prisma.plan.update({
        where: {uuid: planUuid},
        data
    });

    await prisma.auditLog.create({
        data: {
            actorUuid: actor.userUuid,
            action: "PLAN_UPDATED",
            targetType: "PLAN",
            targetUuid: planUuid,
            ipAddress: actor.ip,
            userAgent: actor.userAgent,
        }
    });
    return updated;
};

export const createPlanVersion= async (
    planUuid: string,
    price: number,
    billingInterval: string,
    features: any
)=>{
    const plan= await prisma.plan.findUniqe({ where:{ uuid: planUuid }});
    if (!plan || !plan.isActive) {
        throw new Error("Plan not found or inactive");
    };

    const lastVersion= await prisma.planVersion.finFirst({
        where: {planUuid},
        orderBy: {version: "desc"}
    });

    const version= (lastVersion?.version ?? 0) + 1;

    return prisma.planVersion.create({
        data: {
            planUuid,
            version,
            price,
            billingInterval,
            features
        }
    })
};

export const setPlanStatus= async (
    planUuid: string,
    isActive: boolean,
    actorUuid: string,
    req: any
)=>{
    const plan= await prisma.plan.findUniqe({where: {uuid: planUuid}});
    if (!plan) throw new Error("Plan not found");

    if(!isActive){
        const activeSubs= await prisma.subscription.count({
            where: {
                planUuid, 
                status: "ACTIVE"
            }
        });
        if (activeSubs > 0) {
            throw new Error("Cannot disable plan with active subscriptions");
        }
    };

    await prisma.plan.update({
        where: {uuid: planUuid},
        data: {isActive}
    });

    await prisma.auditLog.create({
        data: {
            actorUuid,
            action: isActive ? "PLAN_ENABLED" : "PLAN_DISABLED",
            targetType: "PLAN",
            targetUuid: planUuid,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        }
    });
};

export const migrateTenantPlan= async (
    tenantUuid: string,
    newPlanVersionUuid: string,
    effective: "IMMEDIATE" | "NEXT_CYCLE"
)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"}
    });
    if (!subscription) {
        throw new Error("Active subscription not found");
    };

    if(effective === "IMMEDIATE"){
        await prisma.$transaction([
            prisma.subscription.update({
                where: {uuid: subscription.uuid},
                data: {
                    planVersionUuid: newPlanVersionUuid,
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: addMonths(new Date(), 1),
                }
            }),

            prisma.subscriptionHistory.history({
                data: {
                    subscriptionUuid: subscription.uuid,
                    event: "MIGRATED",
                    oldPlanVersionUuid: subscription.planVersionUuid,
                    newPlanVersionUuid,
                },
            }),
        ]);
    }else{
        await prisma.subscription.update({
            where: {uuid: subscription.uuid},
            data: {cancelAtPeriodEnd: true}
        })
    }
};

export const calculateMonthlyBill= async (tenantUuid: string)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"},
        include: {planVersion: true}
    });
    if (!subscription) throw new Error("No active subscription");

    const addOns= await prisma.tenantAddOn.findMany({
        where: { tenantUuid },
        include: { addOn: true },
    });

    const addOnsTotal = addOns.reduce(
        (sum, a) => sum + a.addOn.priceMonthly * a.quantity,
        0
    );

    return {
        base: subscription.planVersion.price,
        addOns: addOnsTotal,
        total: subscription.planVersion.price + addOnsTotal
    };
};

export const resolveTenantUuid= async (tenantUuid: string)=>{
    const enterprise= await prisma.enterpriseContract.findFirst({
        where: { tenantUuid },
    });
    if(enterprise) return enterprise.customLimits;

    const subscription= await prisma.subscription.findFirst({
        where: { tenantUuid, status: "ACTIVE" },
        include: { planVersion: true },
    });
    if(!subscription) throw new Error("No active subscription");

    return subscription.planVersion.features;
};