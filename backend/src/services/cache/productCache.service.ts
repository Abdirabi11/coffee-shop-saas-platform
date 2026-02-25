import { redis } from "../../lib/redis.ts";
import { ProductService } from "../products/product.service.ts";


export class ProductCacheService{
    private static readonly CACHE_TTL = 1800; // 30 minutes
    private static readonly CACHE_PREFIX = "product";

    //Get single product (with cache)
    static async getProduct(input: {
        storeUuid: string;
        productUuid: string;
        tenantUuid: string;
    }){
        const cacheKey= `${this.CACHE_PREFIX}:${input.productUuid}`;

        try {
            const cached = await redis.get(cacheKey);
      
            if (cached) {
                return JSON.parse(cached);
            };

            // Fetch from database
            const product = await ProductService.getByUuid(input);

            if (product) {
                await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(product));
            };

            return product;
        } catch (error: any) {
            // Fallback to database
            return ProductService.getByUuid(input);
        }
    }

    //Invalidate product cache
    static async invalidate(productUuid: string) {
        const cacheKey = `${this.CACHE_PREFIX}:${productUuid}`;
        await redis.del(cacheKey);
    }
}