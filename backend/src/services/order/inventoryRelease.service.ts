import prisma from "../../config/prisma.ts"

type PrismaTx = Prisma.TransactionClient;

export class InventoryReleaseService {
    static async release(orderUuid: string) {
        const items = await prisma.orderItem.findMany({
            where: {
                orderUuid,
                inventoryReserved: true,
                inventoryReleased: false,
            },
            include: {
                order: {
                    select: { tenantUuid: true, storeUuid: true },
                },
            },
        });
        await prisma.$transaction(async (tx) => {
            for (const item of items) {
                const stock = await tx.inventoryItem.findFirst({
                    where: {
                        productUuid: item.productUuid,
                    },
                });
  
                if (stock) {
                    // Release reservation (use correct field names)
                    await tx.inventoryItem.update({
                        where: { uuid: stock.uuid },
                        data: {
                            availableStock: { increment: item.quantity },
                            reservedStock: { decrement: item.quantity },
                        },
                    });

                    await tx.inventoryMovement.create({
                        data: {
                            tenantUuid: stock.tenantUuid,
                            inventoryItemUuid: stock.uuid,
                            type: "RETURN",
                            quantity: item.quantity,
                            previousStock: stock.availableStock,
                            newStock: stock.availableStock + item.quantity,
                            referenceType: "ORDER",
                            referenceUuid: orderUuid,
                            reason: "Order cancelled/failed",
                        },
                    });
                };
        
                await tx.orderItem.update({
                    where: { uuid: item.uuid },
                    data: { inventoryReleased: true },
                });
            }
        });
    }
}

export class InventoryReleaseService{
    static async release(tx: PrismaTx, orderUuid: string){
        const items= await prisma.orderItem.findMany({
            where: {orderUuid}
        });

        for(const item of items){
            await tx.inventory.update({
                where: {productUuid: item.productUuid},
                data: {
                    available: { increment: item.quantity },
                    reserved: { decrement: item.quantity },
                },
            })
        }
    }
};