import prisma from "../config/prisma.ts"
import dayjs from "dayjs";
import { createMonthlyBillingSnapshot } from "../services/billingSnapshot.service.ts";
import { invalidateAdminDashboards } from "../utils/cache.ts";


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

export const runMonthlyBilling = async () => {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { uuid: true },
    });
  
    for (const tenant of tenants) {
      await createMonthlyBillingSnapshot(tenant.uuid);
    };

    await invalidateAdminDashboards();
};