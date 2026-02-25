import prisma from "../../config/prisma.ts"

export class ProductFavorite{
    static async addToFavorites(input: {
        tenantUuid: string;
        tenantUserUuid: string;
        productUuid: string;
    }){
        return prisma.userFavorite.upsert({
            where: {
                tenantUserUuid_productUuid: {
                    tenantUserUuid: input.tenantUserUuid,
                    productUuid: input.productUuid,
                },
            },
            update: {},
            create: {
                tenantUuid: input.tenantUuid,
                tenantUserUuid: input.tenantUserUuid,
                productUuid: input.productUuid,
            },
        });
    }

    static async removeFromFavorites(input: {
        tenantUserUuid: string;
        productUuid: string;
    }){
        await prisma.userFavorite.delete({
            where: {
                    tenantUserUuid_productUuid: {
                    tenantUserUuid: input.tenantUserUuid,
                    productUuid: input.productUuid,
                },
            },
        });
    }
    
    static async getFavorites(tenantUserUuid: string) {
        return prisma.userFavorite.findMany({
            where: { tenantUserUuid },
            include: {
                product: {
                    include: {
                        category: true,
                        inventory: true,
                    },
                },
            },
        });
    }
}