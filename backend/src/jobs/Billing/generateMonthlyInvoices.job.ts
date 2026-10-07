import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import dayjs from "dayjs";

export async function generateMonthlyInvoices() {
    console.log("🧾 Generating monthly invoices");

    // The billing period, as fixed instants: the current calendar month,
    // anchored at UTC midnight so every instance computes the same
    // periodStart for the unique (tenant, subscription, type, periodStart)
    // index regardless of when in the run it reads the clock.
    const now = dayjs();
    const periodStart = new Date(Date.UTC(now.year(), now.month(), 1));
    const periodEnd = new Date(Date.UTC(now.year(), now.month() + 1, 1) - 1);
    
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
    let skipped = 0;
    let failed = 0;
  
    for (const sub of activeSubscriptions) {
        try {
            // Already billed for this period (earlier run, or another instance)
            const existing = await prisma.invoice.findFirst({
                where: {
                    tenantUuid: sub.tenantUuid,
                    subscriptionUuid: sub.uuid,
                    type: "SUBSCRIPTION",
                    periodStart,
                },
                select: { uuid: true },
            });
            if (existing) {
                skipped++;
                continue;
            }

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
                    periodStart,
                    periodEnd,
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
            // Lost a race on the unique period index: the invoice exists
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002" &&
                (error.meta?.target as string[] | undefined)?.includes("periodStart")
            ) {
                skipped++;
                continue;
            }
            console.error(`Failed to generate invoice for ${sub.uuid}:`, error.message);
            failed++;
        }
    }
    console.log(`✅ Invoices: ${created} created, ${skipped} already billed, ${failed} failed`);
    return { created, skipped, failed };
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