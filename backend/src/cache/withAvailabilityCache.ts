import { getTimeBucket } from "../utils/timeBucket.ts";
import { getCacheVersion } from "./cacheVersion.ts.js";
import { withCache } from "./cache.ts.js";

interface AvailabilityCacheOptions<T>{
    prefix: string;          
    entityUuid: string;      
    ttlSeconds?: number;     
    fetcher: () => Promise<T>;
};

export async function withAvailabilityCache<T>({
    prefix,
    entityUuid,
    ttlSeconds = 300,
    fetcher,
}: AvailabilityCacheOptions <T>): Promise<T>{
    const bucket= getTimeBucket();
    const version= await getCacheVersion(`${prefix}:${entityUuid}`);
    const cacheKey= `${prefix}:${entityUuid}:v${version}:t${bucket}`;

    return withCache(cacheKey, ttlSeconds, fetcher);
};