import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";

export class ProductNotificationService{
    static async notifyBackInStock(input: {
        productUuid: string;
        tenantUuid: string;
        storeUuid: string;
    }){
        // Get users who favorited this product
        const favorites = await prisma.userFavorite.findMany({
            where: {
                productUuid: input.productUuid,
            },
            include: {
                tenantUser: {
                    include: { user: true },
                },
            },
        });
  
        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });
  
        for (const favorite of favorites) {
            const user = favorite.tenantUser.user;
    
            // Push notification
            await PushNotificationService.send({
                userUuid: user.uuid,
                title: "Back in Stock!",
                body: `${product?.name} is now available to order`,
                data: {
                    type: "PRODUCT_BACK_IN_STOCK",
                    productUuid: input.productUuid,
                },
            });
        };
    }

    //Notify when product price drops
    static async notifyPriceDown(input: {
        productUuid: string;
        oldPrice: number;
        newPrice: number;
    }) {
        const favorites = await prisma.userFavorite.findMany({
            where: { productUuid: input.productUuid },
            include: {
                tenantUser: { include: { user: true } },
            },
        });
      
        const product = await prisma.product.findUnique({
            where: { uuid: input.productUuid },
        });
      
        const discount = Math.round(((input.oldPrice - input.newPrice) / input.oldPrice) * 100);
      
        for (const favorite of favorites) {
            await PushNotificationService.send({
                userUuid: favorite.tenantUser.user.uuid,
                title: `${discount}% Off!`,
                body: `${product?.name} price dropped to $${input.newPrice / 100}`,
                data: {
                    type: "PRODUCT_PRICE_DROP",
                    productUuid: input.productUuid,
                },
            });
        };
    }

    //Notify when new products added to favorite category
    static async notifyNewProductInCategory(input: {
        categoryUuid: string;
        productUuid: string;
    }) {
        // Implementation here
    }
}

EventBus.on("INVENTORY_BACK_IN_STOCK", async (payload) => {
    await ProductNotificationService.notifyBackInStock({
      productUuid: payload.productUuid,
      tenantUuid: payload.tenantUuid,
      storeUuid: payload.storeUuid,
    });
});
  
EventBus.on("PRODUCT_PRICE_UPDATED", async (payload) => {
    if (payload.newPrice < payload.oldPrice) {
        await ProductNotificationService.notifyPriceDown({
            productUuid: payload.productUuid,
            oldPrice: payload.oldPrice,
            newPrice: payload.newPrice,
        });
    }
});