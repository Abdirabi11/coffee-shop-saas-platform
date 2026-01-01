import type { Request, Response, NextFunction } from "express"
import prisma from "../../config/prisma.ts"


// Analytics integration
// Plan analytics:
// Subscribers per plan
// Revenue per plan
// Churn per plan

export const listPlans= async (req:Request, res:Response)=>{
    const plans= await prisma.plan.findMany({
        where: { isActive: true},
        include: {
            versions: {
                orderBy: { version: "desc" },
                take: 1, // latest version only
            },
        },
        orderBy: { price: "asc" },
    });

    if (!plans.isActive) {
        throw new Error("Plan is not available");
    };

    res.json(plans);
};

export const createPlan= async (req:Request, res:Response)=>{
    const { name, description } = req.body;
    if (!name || !description) {
        return res.status(400).json({ message: "Missing required fields" });
    };

    const existing = await prisma.plan.findUnique({ where: { name } });
    if (existing) {
        return res.status(409).json({ message: "Plan already exists" });
    };

    const plan= await prisma.plan.create({
        data: { name, description, isActive: true },
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

export const createPlanVersion= async(req: Request, res: Response)=>{
    const {planUuid}= req.params;
    const {price, interval, features}= req.body;

    const plan= await prisma.plan.findUnique({ where: {uuid: planUuid} });
    if (!plan || !plan.isActive) {
        return res.status(404).json({ message: "Plan not found or inactive" });
    };

    const lastVersion= await prisma.planversion.findFirst({
        where: {planUuid},
        orderBy: { version: "desc" }
    });

    const version = (lastVersion?.version ?? 0) + 1;

    const planVersion= await prisma.planversion.create({
        data: {
            planUuid,
            version,
            price,
            billingInterval: interval,
            features,
        }
    });
    res.status(201).json(planVersion);
};

export const updatePlan= async (req:Request, res:Response)=>{
    const {planUuid}= req.params;
    const {name, description}= req.body;
    
    const plan= await prisma.plan.findUnique({where: {uuid: planUuid}});
    if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
    };

    const updated = await prisma.plan.update({
        where: { uuid: planUuid },
        data: { name, description },
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

export const disablePlan= async (req:Request, res:Response)=>{
    const {planUuid}= req.params;;
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
    const {newPlanVersionUuid, effective}= req.body;

    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"}
    });
    if (!subscription) {
        return res.status(404).json({ message: "Active subscription not found" });
    };

    if(effective === "IMMEDIATE"){
        await prisma.$transaction([
            await prisma.subscription.update({
                where: {uuid: subscription.uuid},
                data: {
                    planUuid: newPlanVersionUuid,
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: addMonths(new Date(), 1)
                }
            }),

            await prisma.subscriptionHistory.create({
                data: {
                  subscriptionUuid: subscription.uuid,
                  event: "MIGRATED",
                  oldPlanVersionUuid: subscription.planVersionUuid,
                  newPlanVersionUuid,
                },
            }),
        ])
    }else{
        await prisma.subscription.update({
            where: { uuid: subscription.uuid },
            data: {
              cancelAtPeriodEnd: true
            }
        });
    };
    res.json({ message: "Plan migration scheduled" });
};

export const calculateMonthlyBill= async (tenantUuid: string)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"},
        include: {planVersion: true}
    });
    if(!subscription) throw new Error("No active subscription");

    const addOns= await prisma.tenantAddOn.findMany({
        where: { tenantUuid },
        include: { addOn: true }
    });

    const addOnsTotal= addOns.reduce(
        (sum, a) => sum + a.addOn.priceMonthly * a.quantity,
        0
    );

    return {
        base: subscription.planVersion.price,
        addOns: addOnsTotal,
        total: subscription.planVersion.price + addOnsTotal
    };
};

export const resolveTenantLimits= async (tenantUuid: string)=>{
    const enterprise= await prisma.enterpriseContract.findFirst({
        where: {tenantUuid}
    });
    if (enterprise) return enterprise.customLimits;

    const subscription= await prisma.subscription.findFirst({
        where: { tenantUuid, status: "ACTIVE" },
        include: { planVersion: true }
    });
    return subscription.planVersion.features;
};