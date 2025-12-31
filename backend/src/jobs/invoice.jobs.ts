import prisma from "../config/prisma.ts"
import dayjs from "dayjs";


export async function generateMonthlyInvoices(){
    console.log("🧾 Generating monthly invoices");

    const period= dayjs().subtract(1, "month").format("YYYY-MM")
    const dueAt= dayjs().add(7, "day").toDate();

    const subscriptions= await prisma.subscription.findMany({
        where: {
            status: "ACTIVE"
        },
        include: {
            planVersion: true
        }
    });

    for(const sub of subscriptions){
        const existingInvoice= await prisma.invoice.findFirst({
            where: {
                tenantUuid: sub.tenantUuid,
                billingPeriod: period
            }
        });

        if (existingInvoice) continue;

        const addonsAmount= 0;
        const baseAmount= sub.plaversion.priceMonthly;

        await prisma.billingSnapshot.count({
            data: {
                tenantUuid: sub.tenantUuid,
                subscriptionUuid: sub.uuid,
                planVersionUuid: sub.planVersionUuid,
                month: period,
                baseAmount,
                addonsAmount,
                totalAmount: baseAmount + addonsAmount,
            }
        });

        await prisma.invoice.create({
            data: {
                tenantUuid: sub.tenantUuid,
                subscriptionUuid: sub.uuid,
                amount: baseAmount + addonsAmount,
                billingPeriod: period,
                dueAt,
                status: "OPEN",
            }
        });
    };
    console.log("✅ Monthly invoices generated");
};

export async function markOverdueInvoices(){
    console.log("⏰ Checking overdue invoices");

    const now= new Date();

    const overdueInvoices= await prisma.invoice.findMany({
        where: {
            status: "OPEN",
            dueAt: {lt: now}
        }
    });

    for (const invoice of overdueInvoices){
        await prisma.invoice.update({
            where: {uuid: invoice.uuid},
            data: {status: "OVERDUE"}
        });

        await prisma.subscription.update({
            where: { uuid: invoice.subscriptionUuid},
            data: { status: "PAST_DUE" },
        })
    };

    console.log(`⚠️ ${overdueInvoices.length} invoices marked overdue`);
};