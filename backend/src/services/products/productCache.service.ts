import { redis } from "../../lib/redis.ts";
import { ProductService } from "../products/product.service.ts";


export class ProductCacheService{
    private static readonly CACHE_TTL = 1800; // 30 minutes
    private static readonly CACHE_PREFIX = "product";

    // Tenant-scoped so a known productUuid can't pull another tenant's entry
    private static key(tenantUuid: string, productUuid: string) {
        return `tenant:${tenantUuid}:${this.CACHE_PREFIX}:${productUuid}`;
    }

    //Get single product (with cache)
    static async getProduct(input: {
        storeUuid: string;
        productUuid: string;
        tenantUuid: string;
    }){
        const cacheKey= this.key(input.tenantUuid, input.productUuid);

        try {
            const cached = await redis.get<any>(cacheKey);
      
            if (cached !== null) {
                return cached;
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
    static async invalidate(tenantUuid: string, productUuid: string) {
        const cacheKey = this.key(tenantUuid, productUuid);
        await redis.del(cacheKey);
    }
}