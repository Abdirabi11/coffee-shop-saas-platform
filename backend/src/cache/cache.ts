import {redis} from "../lib/redis.ts"

export async function withCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
): Promise<T> {
     try {
        const cached = await redis.get(key);
        if (cached !== null && cached !== undefined) {
            // Upstash auto-deserializes JSON — if it's already an object, return directly
            if (typeof cached === "string") {
                return JSON.parse(cached);
            }
            return cached as T;
        }
    } catch (err) {
        // Bad cache entry — delete and fall through
        await redis.del(key).catch(() => {});
    }

    const fresh = await fetcher();
    await redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds });
    return fresh;
};

export const invalidateCache= async (pattern: string)=>{
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
        console.error("[CACHE_INVALIDATE_FAILED]", pattern);
    }
};