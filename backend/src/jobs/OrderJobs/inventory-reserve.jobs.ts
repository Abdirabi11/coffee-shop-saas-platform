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
};