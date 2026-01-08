import { withCache } from "../cache/cache.ts";
import prisma from "../config/prisma.ts"
import { DomainEvent } from "../events/event.types.ts";
import { eventBus } from "../events/eventBus.ts";


export const createInvoiceFromSnapshot= async (
    billingSnapshotUuid: string
)=>{
    const snapshot= await prisma.billingSnapshot.findUnique({
        where: {uuid: billingSnapshotUuid},
        include: {
            tenant: true
        }
    });
    if(!snapshot){
        throw new Error("Billing snapshot not found");
    };

    const invoiceNumber= `INV-${Date.now()}`;
    
    const invoice= await prisma.invoice.create({
        data: {
            invoiceNumber,

            tenantUuid: snapshot.tenantUuid,
            billingSnapshotUuid: snapshot.uuid,
      
            periodStart: snapshot.periodStart,
            periodEnd: snapshot.periodEnd,
      
            subtotal: snapshot.totalAmount,
            tax: 0,
            total: snapshot.totalAmount,
      
            currency: snapshot.currency,
        }
    });

    await eventBus.emit(DomainEvent.INVOICE_CREATED, {
        tenantUuid: invoice.tenantUuid,
        invoiceUuid: invoice.uuid,
    });
    
    return invoice;
};

export async function getTenantInvoices(
    tenantUuid: string,
    page = 1,
    limit = 20
  ){
    const key= `tenant:${tenantUuid}:invoices:p${page}:l${limit}`;

    return withCache(key, 60, async () => {
        return prisma.invoice.findMany({
          where: { tenantUuid },
          orderBy: { issuedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        });
      });
};

// D. Invoice Paid (MOST CRITICAL)

// Wherever you mark invoice as PAID (service or webhook):

// await prisma.$transaction(async (tx) => {
//   await tx.invoice.update({
//     where: { uuid: invoiceUuid },
//     data: {
//       status: "PAID",
//       paidAt: new Date(),
//     },
//   });

//   await tx.subscription.update({
//     where: { uuid: subscriptionUuid },
//     data: { status: "ACTIVE" },
//   });
// });

// await eventBus.emit(DomainEvent.INVOICE_PAID, {
//     tenantUuid,
//     invoiceUuid,
//   });

// // ✅ AFTER commit
// await invalidateAdminDashboards();
// await invalidateTenantCaches(tenantUuid);