import prisma from "../../config/prisma.ts"

export async function markOverdueInvoices() {
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