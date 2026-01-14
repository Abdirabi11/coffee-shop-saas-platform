import dayjs from "dayjs";
import { getCacheVersion } from "../../cache/cacheVersion.ts";
import { withAvailabilityCache } from "../../cache/withAvailabilityCache.ts"
import prisma from "../../config/prisma.ts"
import { CategoryAvailabilityService } from "../category/category-availability.service.ts";
import { ProductAvailabilityService } from "../products/product-availability.service.ts";
import { StoreOpeningService } from "../store/storeOpening.service.ts"
import { MenuAnalyticsService } from "./menuAnalytics.service.ts";

export class MenuService{
    static async getStoreMenu( storeUuid: string){
        const now= new Date();
        const timeBucket = dayjs(now).format("YYYY-MM-DD-HH-mm").slice(0, 15);
        const version = await getCacheVersion(`menu:${storeUuid}`);

        MenuAnalyticsService.trackMenuView(storeUuid).catch(console.error);
        
        return withAvailabilityCache({
            prefix: "menu",
            entityUuid: `${storeUuid}:v${version}:${timeBucket}`,
            ttlSeconds: 300,
            fetcher: async ()=>{
                const isOpen= await StoreOpeningService.isStoreOpen(storeUuid, now)
                if(!isOpen){
                    return {
                        storeUuid,
                        generatedAt: now.toISOString(),
                        categories: [],
                    };
                }

                const categories= await prisma.category.findMany({
                    where: {storeUuid, isActive: true},
                    orderBy: {order: "desc"},
                    include: {
                        products: {
                          where: { isActive: true },
                          orderBy: { createdAt: "asc" },
                          include: { options: true },
                        },
                    },
                });

                const menuCategories = [];

                for (const category of categories){
                    const visible= await CategoryAvailabilityService.isCategoryAvailable(
                        category.uuid,
                        now
                    );
                    if (!visible) continue;

                    const products = [];

                    for (const product of category.products){
                        const productAvailable= await ProductAvailabilityService.isProductAvailable(
                            product.uuid,
                            now
                        );

                        if (!productAvailable) continue;

                        products.push({
                            uuid: product.uuid,
                            name: product.name,
                            description: product.description,
                            price: product.basePrice,
                            imageUrl: product.imageUrl,
                            options: product.options.map(o => ({
                              uuid: o.uuid,
                              name: o.name,
                              extraCost: o.extraCost,
                            })),
                        });
                    }

                    if (products.length === 0) continue;

                    menuCategories.push({
                        uuid: category.uuid,
                        name: category.name,
                        order: category.order,
                        products
                    });
                };
                return {
                    storeUuid,
                    generatedAt: now.toISOString(),
                    categories: menuCategories,
                };  
            },
        })
    } 
};

export class MenuPolicyService {
    static apply(menu: any, user?: AuthUser) {
      if (!user) return menu;
  
      return {
        ...menu,
        categories: menu.categories.map(c => ({
          ...c,
          products: c.products.map(p => ({
            ...p,
            isFavorite: user.favorites?.includes(p.uuid),
            loyaltyPrice: user.loyaltyLevel
              ? Math.round(p.price * 0.9)
              : undefined,
          })),
        })),
      };
    }
};

export class MenuPersonalizationService{
    static async apply(menu: any, user?: AuthUser){
        if (!user) return menu;

        return {
            ...menu,
            categories: menu.categories.map(category => ({
              ...category,
              products: category.products.map(product => {
                const isFavorite = user.favorites?.includes(product.uuid);
      
                const loyaltyPrice = user.loyaltyLevel
                  ? Math.round(product.price * 0.9)
                  : undefined;
      
                return {
                  ...product,
                  isFavorite,
                  loyaltyPrice,
                };
              }),
            })),
        }
    }
}
