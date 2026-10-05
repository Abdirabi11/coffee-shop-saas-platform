import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"

export class GenerateBillingSnapshotsJob {
    static async run() {
        console.log("🧾 Generating billing snapshots");
    
        const activeSubscriptions = await prisma.subscription.findMany({
            where: { status: "ACTIVE" },
            include: {
            plan: true,
            planPrice: true,
            addOns: {
                where: { status: "ACTIVE" },
                include: {
                addOnPrice: true,
                },
            },
            },
        });
  
        const billingMonth = dayjs().subtract(1, "month").format("YYYY-MM");
        const periodStart = dayjs(billingMonth).startOf("month").toDate();
        const periodEnd = dayjs(billingMonth).endOf("month").toDate();
    
        let created = 0;
        let failed = 0;
    
        for (const sub of activeSubscriptions) {
            try {
            const baseAmount = sub.planPrice?.amount ?? 0;

            const addOnsTotal = sub.addOns.reduce((sum, addOn) => {
                const price = addOn.addOnPrice?.amount ?? 0;
                return sum + price * addOn.quantity;
            }, 0);

            const usageCharges = await this.calculateUsageCharges(
                sub.uuid,
                periodStart,
                periodEnd
            );
    
            const totalAmount = baseAmount + addOnsTotal + usageCharges;
    
            await prisma.billingSnapshot.create({
                data: {
                tenantUuid: sub.tenantUuid,
                subscriptionUuid: sub.uuid,
                planUuid: sub.planUuid,
                planVersionUuid: sub.planPriceUuid,
                billingMonth: periodStart,
                periodStart,
                periodEnd,
                planName: sub.plan.name,
                planSlug: sub.plan.slug,
                billingInterval: sub.interval,
                subscriptionBase: baseAmount,
                addOnsTotal,
                usageTotal: usageCharges,
                subtotal: totalAmount,
                taxTotal: 0,
                totalAmount,
                currency: sub.currency,
                planSnapshot: {
                    planName: sub.plan.name,
                    planPrice: baseAmount,
                },
                addOnsSnapshot: sub.addOns.map((addOn) => ({
                    addOnUuid: addOn.addOnUuid,
                    name: addOn.addOn.name,
                    quantity: addOn.quantity,
                    unitPrice: addOn.addOnPrice?.amount ?? 0,
                    total: (addOn.addOnPrice?.amount ?? 0) * addOn.quantity,
                })),
                usageSnapshot: usageCharges > 0 ? { charges: usageCharges } : null,
                },
            });
    
            created++;
            } catch (error: any) {
                console.error(
                    `Failed to create billing snapshot for ${sub.uuid}:`,
                    error.message
                );
                failed++;
            }
        }
        console.log(
            `✅ Billing snapshots: ${created} created, ${failed} failed`
        );
  
        return { created, failed };
    }
  
    private static async calculateUsageCharges(
        subscriptionUuid: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<number> {
      
        const usageRecords = await prisma.subscriptionUsageRecord.findMany({
            where: {
                subscriptionUuid,
                periodStart: { lte: periodEnd },
                periodEnd: { gte: periodStart },
            },
        });
  
        const total = usageRecords.reduce((sum, record) => {
            return sum + (record.quantity * (record.unitPrice ?? 0));
        }, 0);
  
        return total;
    }
}