import { withCache } from "../cache/cache.ts";
import prisma from "../config/prisma.ts"
import { DomainEvent } from "../events/event.types.ts";
import { eventBus } from "../events/eventBus.ts";

export const createMonthlyBillingSnapshot= async (tenantUuid: string)=>{
    const subscription= await prisma.subscription.findFirst({
        where: {tenantUuid, status: "ACTIVE"},
        include: { planVersion: { include: {plan: true} }
        }
    });
    if (!subscription) {
        throw new Error("No active subscription");
    };

    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;

    const existing= await prisma.billingSnapshot.findFirst({
        where: { tenantUuid, periodStart, periodEnd, }
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

    const snapshot= await prisma.billingSnapshot.create({
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

    await eventBus.emit(DomainEvent.BILLING_SNAPSHOT_CREATED, {
        tenantUuid,
        billingSnapshotUuid: snapshot.uuid,
    });
    
    return snapshot;
};

export async function getBillingSnapshots(
    tenantUuid: string,
    page = 1,
    limit = 12
){
    const key= `tenant:${tenantUuid}:billing-snapshots:p${page}:l${limit}`;

    return withCache(key, 120, async () => {
        return prisma.billingSnapshot.findMany({
          where: { tenantUuid },
          orderBy: { periodStart: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        });
    });
}