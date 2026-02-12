import prisma from "../../config/prisma.ts"

export class InventoryReserveJob{
  static async run(
      tx: Prisma.TransactionClient,
      items: { productUuid: string; quantity: number }[]
  ){
    for (const item of items) {
      const inventory = await tx.inventoryItem.findFirst({
        where: { productUuid: item.productUuid },
      });

      if (!inventory) {
        throw new Error(`No inventory found for product: ${item.productUuid}`);
      };
      if (inventory.availableStock < item.quantity) {
        throw new Error(
          `Insufficient inventory for ${item.productUuid}. Available: ${inventory.availableStock}, Requested: ${item.quantity}`
        );
      };

      await tx.inventoryItem.update({
        where: { uuid: inventory.uuid },
        data: {
          availableStock: { decrement: item.quantity },
          reservedStock: { increment: item.quantity },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          tenantUuid: inventory.tenantUuid,
          inventoryItemUuid: inventory.uuid,
          type: "SALE",
          quantity: -item.quantity,
          previousStock: inventory.availableStock,
          newStock: inventory.availableStock - item.quantity,
          referenceType: "ORDER",
          referenceUuid: "pending", 
          reason: "Order placed - inventory reserved",
        },
      });
    }
  };
};