import prisma from "../../config/prisma.ts"

export class ReleaseInventoryJob {
    static async run(orderUuid: string) {
      const items = await prisma.orderItem.findMany({
        where: { orderUuid },
      });
  
      for (const item of items) {
        await prisma.inventory.update({
          where: { productUuid: item.productUuid },
          data: {
            available: { increment: item.quantity },
            reserved: { decrement: item.quantity },
          },
        });
      }
    }
  }