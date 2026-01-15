import prisma from "../../config/prisma.ts"

export class MenuFilterService{
    static async applu(menu: any, filters: {
        maxPrice?: number;
        minPrice?: number;
        onlyFavorites?: boolean;
        tags?: string[];
        sortBy?: "price" | "popularity";
    }){
        return {
            ...menu,
            categories: menu.categories.map(category => ({
                ...category,
                products: category.products
                  .filter(product => {
                    if (filters.maxPrice && product.price > filters.maxPrice) return false;
                    if (filters.minPrice && product.price < filters.minPrice) return false;
                    if (filters.onlyFavorites && !product.isFavorite) return false;
                    if (
                        filters.tags &&
                        !filters.tags.every(t => product.tags?.includes(t))
                    ) return false;
                    return true;
                  })
                  .sort((a, b)=> {
                    if (filters.sortBy === "price") return a.price - b.price;
                    if (filters.sortBy === "popularity")
                      return (b.views ?? 0) - (a.views ?? 0);
                    return 0;
                  })
            }))
        }
    };

    static filter(menu: any, filters: any){
        return {
            ...menu,
            categories: menu.categories.map(c => ({
                ...c,
                products: c.products.filter(p => {
                    if (filters.maxPrice && p.price > filters.maxPrice) return false;
                    if (filters.onlyFavorites && !p.isFavorite) return false;
                    return true;
                })
            }))
        }
    }
}