import prisma from "../../config/prisma.ts"


export class InventoryService{
    static async deductForOrder(orderUuid: string){
        const order= await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: {
                items: true,
            },
        });
        if (!order) throw new Error("Order not found");

        await prisma.$transaction(async (tx) =>{
            for (const item of order.items){
                const updated= await tx.InventoryItem.updateMany({
                    where: {
                        storeUuid: order.storeUuid,
                        productUuid: item.productUuid,
                        stock: {
                          gte: item.quantity,
                        },
                    },
                    data: {
                        stock: {
                            decrement: item.quantity,
                        },
                    },
                });

                if (updated.count === 0) {
                    throw new Error(
                      `Insufficient stock for product ${item.productUuid}`
                    );
                };
            }
        });
    };

    static async reserve(tx:PrismaTx, input: {
        orderUuid: string,
        items: { productUuid: string; quantity: number }[];
    }){
        for(const item of input.items){
            const stock= await tx.inventory.findUnique({
                where: {productUuid: item.productUuid }
            });
            if (!stock || stock.available < item.quantity) {
                throw new Error("INSUFFICIENT_STOCK");
            };

            await tx.inventory.update({
                where: {productUuid: item.productUuid},
                data: {
                    available: { decrement: item.quantity },
                    reserved: { increment: item.quantity },
                },
            })
        }
    }
};