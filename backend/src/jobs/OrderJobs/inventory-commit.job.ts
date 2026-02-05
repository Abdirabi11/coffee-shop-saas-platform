import prisma from "../../config/prisma.ts"

export class InventoryCommitJob{
  static async run(orderUuid: string) {
    const order = await prisma.order.findUnique({
      where: { uuid: orderUuid },
      select: {
        uuid: true,
        status: true,
        inventoryCommitted: true,
      },
    });

    if (!order) {
      console.error(`[InventoryCommitJob] Order not found: ${orderUuid}`);
      return;
    };
    if (order.inventoryCommitted) {
      console.log(`[InventoryCommitJob] Already committed: ${orderUuid}`);
      return;
    }
    if (order.status !== "PAID") {
      console.log(`[InventoryCommitJob] Wrong status: ${order.status}`);
      return;
    };

    const items = await prisma.orderItem.findMany({
      where: { orderUuid },
      select: {
        productUuid: true,
        quantity: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      // Commit inventory (move from reserved to sold)
      for (const item of items) {
        const inventory = await tx.inventoryItem.findFirst({
          where: { productUuid: item.productUuid },
        });

        if (!inventory) {
          console.error(`[InventoryCommitJob] No inventory for product: ${item.productUuid}`);
          continue;
        };

        await tx.inventoryItem.update({
          where: { uuid: inventory.uuid },
          data: {
            reservedStock: { decrement: item.quantity },
            currentStock: { decrement: item.quantity },
            availableStock: { set: inventory.currentStock - item.quantity },
          },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantUuid: inventory.tenantUuid,
            inventoryItemUuid: inventory.uuid,
            type: "SALE",
            quantity: -item.quantity,
            previousStock: inventory.currentStock,
            newStock: inventory.currentStock - item.quantity,
            referenceType: "ORDER",
            referenceUuid: orderUuid,
            reason: "Order completed",
          },
        });
      }

      await tx.order.update({
        where: { uuid: orderUuid },
        data: { inventoryCommitted: true },
      });
    });
    console.log(`[InventoryCommitJob] Committed inventory for order: ${orderUuid}`);
  };
};