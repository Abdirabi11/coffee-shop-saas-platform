import { invalidateMenu } from "../../cache/menu.invalidate.ts";
import prisma from "../../config/prisma.ts"

export class ProductService{
    static async create(storeUuid: string, data: any){
        const product= await prisma.product.create({
            data: {
                storeUuid,
                name: data.name,
                description: data.description,
                basePrice: data.basePrice,
                imageUrl: data.imageUrl,
                categoryUuid: data.categoryUuid,
            }
        });
        await invalidateMenu(storeUuid);
        return product;
    };

    static async list(storeUuid: string){
        return prisma.prodct.findMany({
            where: {
                storeUuid,
                isDeleted: false
            },
            include: {
                category: true,
                optionGroups: {
                    include: { options: true },
                }
            },
            orderBy: {createdAT: "desc"}
        });
    };

    static async getByUuid(storeUuid: string, productUuid: string){
        return prisma.product.findFirst({
            where: {
                uuid: productUuid,
                storeUuid,
                isDeleted: false,
            },
            include: {
                category: true,
                optionGroups: {
                    include: { options: true },
                },
            }
        })
    };

    static async update(storeUuid:string, productUuid: string, data: any, userUuid: string){
        const product= await prisma.product.update({
            where: {uuid: productUuid},
            data,
        })
        await invalidateMenu(storeUuid, "PRODUCT_CHANGE", userUuid);
        return product;
    };

    static async softDelete(storeUuid: string, productUuid: string) {
        const product= await prisma.product.update({
          where: { uuid: productUuid },
          data: { isDeleted: true },
        });
        await invalidateMenu(storeUuid);
        return product;
    };
};