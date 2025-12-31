import prisma from "../config/prisma.ts"
import dayjs from "dayjs";


export async function suspendOverdueTenants(){
    console.log("🚫 Checking overdue tenants");

    const graceLimit= dayjs().subtract(14, "days").toDate();

    const overdueSubs= await prisma.subscription.findMany({
        where: {
            status: "PAST_DUE",
            updatedAt: { lt: graceLimit}
        }
    });

    for (const sub of overdueSubs){
        await prisma.tenant.update({
            where: {uuid: sub.tenantUuid},
            data: {status: "SUSPENDED"}
        })
    };

    console.log(`🚨 ${overdueSubs.length} tenants suspended`);
}