import prisma from "../../config/prisma.ts"
import { billingEnforcementEnabled } from "./billingEnforcement.ts";

export async function markOverdueInvoices() {
    // Off until platform invoices can be paid: see billingEnforcement.ts
    if (!billingEnforcementEnabled("markOverdueInvoices")) return 0;

    console.log("⏰ Marking overdue invoices");
  
    const result = await prisma.invoice.updateMany({
        where: {
            status: "OPEN",
            dueDate: { lt: new Date() },
        },
        data: {
            status: "OVERDUE",
        },
    });
  
    console.log(`✅ Marked ${result.count} invoices as overdue`);
    return result.count;
};