import prisma from "../../config/prisma.ts"

type PrismaTx = Prisma.TransactionClient;


export class InventoryService{
    static async reserve(tx: PrismaTx, input: {
        orderUuid: string;
        items: { productUuid: string; quantity: number }[];
    }) {
        for (const item of input.items){
            const stock= await tx.inventoryItem.findUnique({
                where: { 
                    productUuid: item.productUuid 
                },
            });

            if (!stock) {
                throw new Error(`No inventory found for product: ${item.productUuid}`);
            };
        
            if (stock.availableStock < item.quantity) {
                const product = await tx.product.findUnique({
                  where: { uuid: item.productUuid },
                  select: { name: true },
                });
        
                throw new Error(
                  `Insufficient stock for ${product?.name ?? "product"}. Available: ${stock.availableStock}, Requested: ${item.quantity}`
                );
            }

            await tx.inventory.update({
                where: { 
                    uuid: stock.uuid
                },
                data: {
                  availableStock: { decrement: item.quantity },
                  reservedStock: { increment: item.quantity },
                },
            });

            await tx.inventoryMovement.create({
                data: {
                  tenantUuid: stock.tenantUuid,
                  inventoryItemUuid: stock.uuid,
                  type: "SALE",
                  quantity: -item.quantity,
                  previousStock: stock.availableStock,
                  newStock: stock.availableStock - item.quantity,
                  referenceType: "ORDER",
                  referenceUuid: input.orderUuid,
                  reason: "Order placed",
                },
            });
        }
    }

    static async checkAvailability(
        productUuid: string,
        quantity: number
    ): Promise<boolean>{
        const stock = await prisma.inventoryItem.findFirst({
            where: { productUuid },
        });
      
        return stock ? stock.availableStock >= quantity : false;
    }
};