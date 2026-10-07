import crypto from "node:crypto";
import {redis} from "../../lib/redis.ts"
import { withTimeout } from "./cache.ts";
import { logWithContext } from "../observability/Logger.ts";

// Like withCache, a version lookup must never take the request down: if Redis
// is unreachable or slow, return a one-off version instead of throwing. It
// matches no cached entry, so the caller goes to the DB. A fixed fallback
// ("1") could match a stale entry from before the last bump and serve old
// menu prices whenever Redis is flaky rather than fully down.
export const getCacheVersion = async (key: string) => {
    try {
        // Upstash deserializes INCR'd values as numbers; normalize to string so
        // callers can compare against header values and embed in keys.
        const version = await withTimeout(redis.get<string | number>(`v:${key}`), "cache version get");
        return String(version ?? "1");
    } catch (err: any) {
        logWithContext("warn", "[Cache] Version read failed, bypassing cache", {
            key,
            error: err.message,
        });
        return `unavailable-${crypto.randomUUID()}`;
    }
};

export const bumpCacheVersion = async (key: string) => {
    await redis.incr(`v:${key}`);
};
