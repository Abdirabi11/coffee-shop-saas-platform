import prisma from "../config/prisma.ts"
import dayjs from "dayjs";


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