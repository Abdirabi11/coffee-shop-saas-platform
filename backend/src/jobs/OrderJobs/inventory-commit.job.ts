import prisma from "../../config/prisma.ts"

export class InventoryCommitJob{
    static async run(orderUuid: string) {
        const order = await prisma.order.findUnique({
          where: { uuid: orderUuid },
        });
    
        if (!order || order.inventoryCommitted) return;
        if(order.status !== "PAID" ) return;
    
        const items = await prisma.orderItem.findMany({
          where: { orderUuid },
        });
    
        await prisma.$transaction(async (tx) => {
          for (const item of items) {
            await tx.inventory.update({
              where: { 
                productUuid: item.productUuid,
                reserved: { gte: item.quantity },
              },
              data: {
                reserved: { decrement: item.quantity },
                stock: { decrement: item.quantity },
              },
            });
          }
    
          await tx.order.update({
            where: { uuid: orderUuid },
            data: { inventoryCommitted: true },
          });
        });
    };
};