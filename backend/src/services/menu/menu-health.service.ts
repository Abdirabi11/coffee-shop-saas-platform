import prisma from "../../config/prisma.ts"

export class MenuHealthService{
    static  analyze(menu: any){
        const totalProducts= menu.categories.reduce(
            (a,c)=> a + c.products.length,
            0
        );

        const avgProductsPerCategory =
            totalProducts / Math.max(menu.categories.length, 1);

        return {
            storeUuid: menu.storeUuid,
            categoryCount: menu.categories.length,
            totalProducts,
            avgProductsPerCategory,
            generatedAt: menu.generatedAt,
        };
    } 
};