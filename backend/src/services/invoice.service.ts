import prisma from "../config/prisma.ts"


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
    
    return prisma.invoice.create({
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
}