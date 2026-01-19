import prisma from "../../config/prisma.ts"

type PrismaTx = Prisma.TransactionClient;

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
}