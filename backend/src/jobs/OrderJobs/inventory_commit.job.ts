import prisma from "../../config/prisma.ts"

//(part of Finalize)
export class InventoryCommitJob{
    static async run(tx: Prisma.TransactionClient, orderUuid: string) {
        const items= await tx.orderItem.findMany({
            where: { orderUuid }
        });

        for (const item of items){
            await tx.inventory.updateMany({
                where: {
                    productUuid: item.productUuid,
                    reserved: { gte: item.quantity }, // safety
                },
                data: {
                    reserved: { decrement: item.quantity },
                    sold: { increment: item.quantity },
                },
            })
        }
    };

    static async run(orderUuid: string) {
        const order = await prisma.order.findUnique({
          where: { uuid: orderUuid },
        });
    
        if (!order || order.inventoryCommitted) return;
    
        const items = await prisma.orderItem.findMany({
          where: { orderUuid },
        });
    
        await prisma.$transaction(async (tx) => {
          for (const item of items) {
            await tx.inventory.update({
              where: { productUuid: item.productUuid },
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