import type { Request, Response, NextFunction } from "express"
import prisma from "../../config/prisma.ts"


// Analytics integration
// Plan analytics:
// Subscribers per plan
// Revenue per plan
// Churn per plan

export const listPlans= async (req:Request, res:Response)=>{
    const plans= await prisma.plans.findMany({
        orderBy: { price: "asc" },
    });

    if (!plans.isActive) {
        throw new Error("Plan is not available");
    }

    res.json(plans);
};

export const createPlan= async (req:Request, res:Response)=>{
    const {
        name,
        price,
        interval,
        maxStaff,
        maxStores,
        maxOrders,
    } = req.body;

    if (!name || !price || !interval || !maxStaff || !maxStores) {
        return res.status(400).json({ message: "Missing required fields" });
    };

    const existing = await prisma.plan.findUnique({ where: { name } });
    if (existing) {
        return res.status(409).json({ message: "Plan already exists" });
    };

    const plan= await prisma.plan.create({
        data: {
            name,
            price,
            interval,
            maxStaff,
            maxStores,
            maxOrders,
        },
    });

    await prisma.auditLog.create({
        data: {
          actorUuid: req.user.userUuid,
          action: "PLAN_CREATED",
          targetType: "PLAN",
          targetUuid: plan.planUuid,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
    });
    res.status(201).json(plan);
};

export const updatePlan= async (req:Request, res:Response)=>{
    const {planUuid}= req.params;
    const updates= req.body;
    
    const plan= await prisma.plan.findUnique({
        where: {uuid: planUuid},
    });
    if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
    };

    const updated = await prisma.plan.update({
        where: { uuid: planUuid },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
    });

    await prisma.auditLog.create({
        data: {
          actorUuid: req.user.userUuid,
          action: "PLAN_UPDATED",
          targetType: "PLAN",
          targetUuid: planUuid,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
    });
    
    res.json(updated);
};

export const createPlanVersion= async(planUuid: string, data: any)=>{
    const lastVersion= await prisma.planversion.findFirst({
        where: {planUuid},
        orderBy: { version: "desc" }
    });
    return await prisma.planversion.create({
        data: {
            planUuid,
            version: (lastVersion?.version ?? 0) + 1,
            priceMonthly: data.priceMonthly,
            features: data.features
        }
    })
}

export const disablePlan= async (req:Request, res:Response)=>{
    const {planUuid}= req.params;

    const plan= await prisma.plan.findUnique({
        where: {uuid: planUuid}
    });
    if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
    };

    await prisma.plan.update({
        where: { uuid: planUuid },
        data: { isActive: false },
    });

    await prisma.auditLog.create({
        data: {
          actorUuid: req.user.userUuid,
          action: "PLAN_DISABLED",
          targetType: "PLAN",
          targetUuid: planUuid,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
    });
    
    res.json({ message: "Plan disabled successfully" });
    
};

export const enablePlan= async (req:Request, res:Response)=>{
    const { planUuid } = req.params;

    await prisma.plan.update({
      where: { uuid: planUuid },
      data: { isActive: true },
    });

    await prisma.auditLog.create({
        data: {
          actorUuid: req.user.userUuid,
          action: "PLAN_ENABLED",
          targetType: "PLAN",
          targetUuid: planUuid,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
    });
  
    res.json({ message: "Plan enabled successfully" });
};

export const migratePlan= async (req:Request, res:Response)=>{
    const {tenantUuid}= req.params;
    const {newPlanUuid, effective}= req.body;

    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"}
    });
    if (!subscription) {
        return res.status(404).json({ message: "Active subscription not found" });
    };

    if(effective === "IMMEDIATE"){
        await prisma.subscription.update({
            where: {uuid: subscription.uuid},
            data: {
                planUuid: newPlanUuid,
                currentPeriodStart: new Date(),
                currentPeriodEnd: addMonths(new Date(), 1)
            }
        })
    }else{
        await prisma.subscription.update({
            where: { uuid: subscription.uuid },
            data: {
              cancelAtPeriodEnd: true
            }
        });

        await prisma.subscription.create({
            data: {
                tenantUuid,
                planUuid: newPlanUuid,
                status: "ACTIVE",
                currentPeriodStart: subscription.currentPeriodEnd,
                currentPeriodEnd: addMonths(subscription.currentPeriodEnd, 1)
            }
        });


        await prisma.$transaction([
            prisma.subscription.update({
              where: { uuid: subscription.uuid },
              data: {
                planVersionUuid: newPlanUuid
              }
            }),
          
            prisma.subscriptionHistory.create({
              data: {
                subscriptionUuid: subscription.uuid,
                event: "MIGRATED",
                oldPlanVersionUuid: subscription.planVersionUuid,
                newPlanUuid
              }
            })
        ]);
    };
    res.json({ message: "Plan migration scheduled" });
}

export const calculateMonthlyBill= async (tenantUuid: string)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"},
        include: {plan: true}
    });

    const addOns= await prisma.tenantAddOn.findMany({
        where: { tenantUuid },
        include: { addOn: true }
    });

    const addOnsTotal= addOns.reduce(
        (sum, a) => sum + a.addOn.priceMonthly * a.quantity,
        0
    );

    return {
        basePrice: subscription.plan.priceMonthly,
        addOnsTotal,
        total: subscription.plan.priceMonthly + addOnsTotal
    };
};

export const resolveTenantLimits= async (tenantUuid: string)=>{
    const enterprise= await prisma.enterpriseContract..findFirst({
        where: {tenantUuid}
    });
    if (enterprise) {
        return enterprise.customLimits;
    };

    const subscription= await prisma.subscription.findFirst({
        where: { tenantUuid, status: "ACTIVE" },
        include: { plan: true }
    });
    return subscription.plan.features;
};