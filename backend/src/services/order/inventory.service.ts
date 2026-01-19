import prisma from "../../config/prisma.ts"

export class InventoryService{
    static async reserve(tx: PrismaTx, input: {
        orderUuid: string;
        items: { productUuid: string; quantity: number }[];
    }) {
        for (const item of input.items){
            const stock= await tx.inventory.findUnique({
                where: { productUuid: item.productUuid },
            });

            if (!stock || stock.available < item.quantity) {
                throw new Error("INSUFFICIENT_STOCK");
            };

            await tx.inventory.update({
                where: { productUuid: item.productUuid },
                data: {
                  available: { decrement: item.quantity },
                  reserved: { increment: item.quantity },
                },
            });
        }
    }
};