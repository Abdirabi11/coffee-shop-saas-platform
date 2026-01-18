import prisma from "../../config/prisma.ts"

export class InventoryReserve{
    static async run(
        tx: Prisma.TransactionClient,
        items: { productUuid: string; quantity: number }[]
    ){
        for (const item of items) {
            const updated = await tx.inventory.updateMany({
              where: {
                productUuid: item.productUuid,
                available: { gte: item.quantity },
              },
              data: {
                available: { decrement: item.quantity },
                reserved: { increment: item.quantity },
              },
            });

            if (updated.count === 0) {
                throw new Error(
                  `Insufficient inventory for ${item.productUuid}`
                );
            };
        }
    };

    static async reserve(tx: PrismaTx, orderUuid: string) {
        const items = await tx.orderItem.findMany({
          where: { orderUuid },
        });
    
        for (const item of items) {
          await tx.inventory.update({
            where: { productUuid: item.productUuid },
            data: {
              reserved: { increment: item.quantity },
            },
          });
        }
    }
};