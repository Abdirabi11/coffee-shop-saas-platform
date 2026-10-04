import {redis} from "../../lib/redis.ts"

export const getCacheVersion = async (key: string) => {
    // Upstash deserializes INCR'd values as numbers; normalize to string so
    // callers can compare against header values and embed in keys.
    const version = await redis.get<string | number>(`v:${key}`);
    return String(version ?? "1");
};
  
export const bumpCacheVersion = async (key: string) => {
    await redis.incr(`v:${key}`);
}; 