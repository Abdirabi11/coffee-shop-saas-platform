import prisma from "../config/prisma.ts"

export class InventoryReleaseJob {
  static async run(orderUuid: string) {
    const order = await prisma.order.findUnique({
      where: { uuid: orderUuid },
      select: {
        uuid: true,
        status: true,
        inventoryReleased: true,
        tenantUuid: true,
      },
    });

    if (!order) return;
    if (order.inventoryReleased) return;
    if (!["CANCELLED", "PAYMENT_FAILED"].includes(order.status)) return;

    const items = await prisma.orderItem.findMany({
      where: {
        orderUuid,
        inventoryReserved: true,
        inventoryReleased: false,
      },
      select: {
        uuid: true,
        productUuid: true,
        quantity: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const inventory = await tx.inventoryItem.findFirst({
          where: { productUuid: item.productUuid },
        });
        if (!inventory) continue;

        // Release reservation (correct field names)
        await tx.inventoryItem.update({
          where: { uuid: inventory.uuid },
          data: {
            reservedStock: { decrement: item.quantity },
            availableStock: { increment: item.quantity },
          },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantUuid: order.tenantUuid,
            inventoryItemUuid: inventory.uuid,
            type: "RETURN",
            quantity: item.quantity,
            previousStock: inventory.availableStock,
            newStock: inventory.availableStock + item.quantity,
            referenceType: "ORDER",
            referenceUuid: orderUuid,
            reason: `Order ${order.status.toLowerCase()}`,
          },
        });

        // Mark item as released
        await tx.orderItem.update({
          where: { uuid: item.uuid },
          data: { inventoryReleased: true },
        });
      }

      // Mark order as released
      await tx.order.update({
        where: { uuid: orderUuid },
        data: { inventoryReleased: true },
      });
    });
    console.log(`[InventoryReleaseJob] Released inventory for order: ${orderUuid}`);
  }
};