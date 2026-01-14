import prisma from "../../config/prisma.ts"

export class FavoriteService{
    static async toggleFavorite(
        userUuid: string,
        storeUuid: string,
        productUuid: string
    ){
        const existing= await prisma.userFavorite.findFirst({
            where: { userUuid, productUuid },
        });
        if (existing) {
            await prisma.userFavorite.delete({ where: { uuid: existing.uuid } });
            return { favorited: false };
        };

        await prisma.userFavorite.create({
            data: { userUuid, storeUuid, productUuid },
        });
      
        return { favorited: true };
      
    };

    static async getUserFavorites(userUuid: string, storeUuid: string) {
        return prisma.userFavorite.findMany({
          where: { userUuid, storeUuid },
          select: { productUuid: true },
        });
    };
}

//frontend

// menu.categories.products.map(p => ({
//     ...p,
//     isFavorite: favoriteProductIds.includes(p.uuid)
//   }))