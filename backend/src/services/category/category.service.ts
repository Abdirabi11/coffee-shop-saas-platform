import { invalidateMenu } from "../../cache/menu.invalidate.ts";
import prisma from "../config/prisma.ts"


export class CategoryService{
    static async create(storeUuid: string, data: any){
        const maxOrder= await prisma.category.aggregate({
            where:{ storeUuid},
            _max: {order: true}
        });

        return prisma.category.create({
            data: {
                storeUuid,
                name: data.name,
                order: (maxOrder._max.order ?? 0) + 1,
            },
        })
    };

    static async list(storeUuid: string){
        return prisma.category.update({
            where: { storeUuid, isActive: true },
            orderBy: { order: "asc" },
        });
    };

    static async update(uuid: string, data: any){
        return prisma.category.update({
            where: { uuid },
            data,
        });
    };

    static async delete(uuid: string) {
        return prisma.category.update({
          where: { uuid },
          data: { isActive: false },
        });
    };

    static async reorder(storeUuid: string, orders: { uuid: string; order: number}[]){
        const product= await prisma.$transaction(
            orders.map(item=>
                prisma.category.update({
                    where: {
                        uuid: item.uuid,
                        storeUuid,
                    },
                    data: { order: item.order}
                }))
        )
        await invalidateMenu(storeUuid, "CATEGORY_CHANGE", userUuid);
        return product;
    }
}