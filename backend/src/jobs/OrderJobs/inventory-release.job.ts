import prisma from "../config/prisma.ts"

export class InventoryReleaseJob {
  static async run(orderUuid: string) {
    const order = await prisma.order.findUnique({
      where: { uuid: orderUuid },
    });

    if (!order || order.inventoryReleased) return;
    if (order.status !== "CANCELLED") return;

    const items = await prisma.orderItem.findMany({
      where: { orderUuid },
    });

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.inventory.update({
          where: { productUuid: item.productUuid },
          data: {
            reserved: { decrement: item.quantity },
          },
        });
      }

      await tx.order.update({
        where: { uuid: orderUuid },
        data: { inventoryReleased: true },
      });
    });
  }
};