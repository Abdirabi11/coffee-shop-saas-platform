import prisma from "../config/prisma.ts"

export const createMonthlyBillingSnapshot= async (tenantUuid: string)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {
            tenantUuid, 
            status: "ACTIVE"
        },
        include: {
            planVersion: {
                include: {plan: true}
            }
        }
    });
    if (!subscription) {
        throw new Error("No active subscription");
    };

    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;

    const existing= await prisma.billingSnapshot.findFirst({
        where: {
            tenantUuid,
            periodStart,
            periodEnd,
        }
    });
    if(existing) return existing;

    const addOns= await prisma.tenantAddOn.findMany({
        where: { tenantUuid },
        include: { addOn: true },
    });

    const addOnsTotal= addOns.reduce(
        (sum, a) => sum + a.addOn.priceMonthly * a.quantity,
        0
    );
    
    const basePrice = subscription.planVersion.price;
    const total = basePrice + addOnsTotal;

    return prisma.billingSnapshot.create({
        data: {
            tenantUuid, 
            subscriptionUuid: subscription.uuid,
            periodStart,
            periodEnd,
    
            basePrice,
            addOnsTotal,
            totalAmount: total,
    
            planVersionUuid: subscription.planVersion.uuid,
            planName: subscription.planVersion.plan.name,
            planVersion: subscription.planVersion.version,
        }
    });
};