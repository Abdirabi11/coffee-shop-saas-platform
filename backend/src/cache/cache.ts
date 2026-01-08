import {redis} from "../lib/redis.ts"

export async function withCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
): Promise<T> {
    const cached= await redis.get(key);
    if (cached) {
        return JSON.parse(cached);
    };

    const fresh= await fetcher();
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
    return fresh;
};

export const invalidateCache= async (pattern: string)=>{
    try {
        const keys= await redis.keys(pattern);
        if (keys.length > 0) await redis.del(keys);
    } catch (err) {
        console.error("[CACHE_INVALIDATE_FAILED]", pattern);
    }
};