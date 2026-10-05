import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";

export async function generateMonthlyInvoices() {
    console.log("🧾 Generating monthly invoices");
    
    // Generating invoices for all active subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        include: {
            tenant: true,
            plan: true,
            planPrice: true,
            addOns: {
            where: { status: "ACTIVE" },
            include: { addOnPrice: true },
            },
        },
    });
  
    let created = 0;
    let failed = 0;
  
    for (const sub of activeSubscriptions) {
        try {
            // Calculate amounts
            const baseAmount = sub.planPrice?.amount ?? 0;
            const addOnsTotal = sub.addOns.reduce((sum, addOn) => {
            return sum + (addOn.addOnPrice?.amount ?? 0) * addOn.quantity;
            }, 0);
    
            const subtotal = baseAmount + addOnsTotal;
            const tax = Math.round(subtotal * 0.1); // 10% tax
            const total = subtotal + tax;
    
            // Generate invoice number
            const invoiceNumber = await generateInvoiceNumber(sub.tenantUuid);
    
            // Create invoice
            await prisma.invoice.create({
                data: {
                    tenantUuid: sub.tenantUuid,
                    subscriptionUuid: sub.uuid,
                    invoiceNumber,
                    type: "SUBSCRIPTION",
                    invoiceDate: new Date(),
                    periodStart: dayjs().startOf("month").toDate(),
                    periodEnd: dayjs().endOf("month").toDate(),
                    dueDate: dayjs().add(30, "days").toDate(),
                    currency: sub.currency,
                    subtotal,
                    taxTotal: tax,
                    total,
                    amountDue: total,
                    status: "OPEN",
                    billTo: {
                    name: sub.tenant.name,
                    email: sub.tenant.email,
                    },
                },
            });
    
            created++;
        } catch (error: any) {
            console.error(`Failed to generate invoice for ${sub.uuid}:`, error.message);
            failed++;
        }
    }
    console.log(`✅ Invoices: ${created} created, ${failed} failed`);
    return { created, failed };
};

async function generateInvoiceNumber(tenantUuid: string): Promise<string> {
    const count = await prisma.invoice.count({
        where: {
            tenantUuid,
            createdAt: {
            gte: dayjs().startOf("year").toDate(),
            },
        },
    });
  
    const year = dayjs().format("YYYY");
    const number = String(count + 1).padStart(4, "0");
    
    return `INV-${year}-${number}`;
};