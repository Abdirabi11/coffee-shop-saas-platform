import { redisClient } from "../lib/redis.ts";
import {redis} from "../lib/redis.ts"

export const getCacheVersion = async (key: string) => {
    const version = await redisClient.get(`v:${key}`);
    return version ?? "1";
};
  
export const bumpCacheVersion = async (key: string) => {
    await redis.incr(`v:${key}`);
};
