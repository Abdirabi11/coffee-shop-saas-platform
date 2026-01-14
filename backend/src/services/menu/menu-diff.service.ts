import prisma from "../../config/prisma.ts"


function flattenMenu(menu: any) {
    const map = new Map();
  
    for (const category of menu.categories) {
      for (const product of category.products) {
        map.set(product.uuid, {
          name: product.name,
          price: product.price,
        });
      }
    }
  
    return map;
}

export class MenuDiffService{
    static async diff(oldMenu: any, newMenu: any){
        const oldMap = flattenMenu(oldMenu);
        const newMap = flattenMenu(newMenu);

        const addedProducts = [];
        const removedProducts = [];
        const priceChanges = [];

        for (const [uuid, newProduct] of newMap){
            if (!oldMap.has(uuid)) {
                addedProducts.push(newProduct);
            } else{
                const oldProduct = oldMap.get(uuid);
                if (oldProduct.price !== newProduct.price) {
                  priceChanges.push({
                    product: newProduct.name,
                    from: oldProduct.price,
                    to: newProduct.price,
                  });
                }
            } 
        };

        for (const [uuid, oldProduct] of oldMap) {
            if (!newMap.has(uuid)) {
              removedProducts.push(oldProduct);
            }
        };

        return {
            addedProducts,
            removedProducts,
            priceChanges,
        };
    }
};

export class MenuDiffAnalyticsService{
    static async record(storeUuid: string, oldSnap: any, newSnap: any){
        const diff= MenuDiffService.diff(oldSnap.menuJson, newSnap.menuJson);

        if (
            diff.addedProducts.length === 0 &&
            diff.removedProducts.length === 0 &&
            diff.priceChanges.length === 0
        ){
            return;
        };

        await prisma.menuDiff.create({
            data: {
              storeUuid,
              fromSnapshot: oldSnap.menuHash,
              toSnapshot: newSnap.menuHash,
              addedProducts: diff.addedProducts,
              removedProducts: diff.removedProducts,
              priceChanges: diff.priceChanges,
            },
        });
    }
}