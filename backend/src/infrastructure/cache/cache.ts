import {redis} from "../../lib/redis.ts"
import { logWithContext } from "../observability/Logger.ts";

// Cache operations must never take the request down with them. The Upstash
// client retries failed calls with exponential backoff (~4s worst case), so
// each cache call is also capped: past this, we stop waiting and go to the DB.
const CACHE_OP_TIMEOUT_MS = 1000;

// ─── Tag index ──────────────────────────────────────────────────────────────
// Every key written through withCache is added to a Redis Set per key prefix
// of TAG_MIN_DEPTH..TAG_MAX_DEPTH segments, e.g. "sa:dashboard:overview:2026"
// is indexed under "tag:sa:dashboard" and "tag:sa:dashboard:overview".
// invalidateCache("sa:dashboard:*") then reads one Set instead of running
// KEYS (O(N) over the whole keyspace, blocking, billed per key on Upstash).
// Each tag Set's TTL tracks the longest TTL of the keys it holds, so stale
// members age out with their keys.
const TAG_PREFIX = "tag:";
const TAG_MIN_DEPTH = 2;
const TAG_MAX_DEPTH = 3;
const DEL_BATCH_SIZE = 500;

function tagsForKey(key: string): string[] {
    const segments = key.split(":");
    const tags: string[] = [];
    // Exclude the full key itself; tags are strict prefixes
    const maxDepth = Math.min(TAG_MAX_DEPTH, segments.length - 1);
    for (let depth = TAG_MIN_DEPTH; depth <= maxDepth; depth++) {
        tags.push(TAG_PREFIX + segments.slice(0, depth).join(":"));
    }
    return tags;
}

export async function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${CACHE_OP_TIMEOUT_MS}ms`)),
            CACHE_OP_TIMEOUT_MS
        );
    });
    try {
        return await Promise.race([op, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export async function withCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
): Promise<T> {
    let cached: T | string | null = null;
    try {
        cached = await withTimeout(redis.get<T | string>(key), "cache get");
    } catch (err: any) {
        // Redis down or slow: serve from the source instead
        logWithContext("warn", "[Cache] Read failed, falling back to source", {
            key,
            error: err.message,
        });
    }

    if (cached !== null && cached !== undefined) {
        // Upstash auto-deserializes JSON — if it's already an object, return directly
        if (typeof cached !== "string") {
            return cached as T;
        }
        try {
            return JSON.parse(cached);
        } catch {
            // Corrupt entry — drop it and rebuild below
            redis.del(key).catch(() => {});
        }
    }

    // Errors from the data source itself must propagate
    const fresh = await fetcher();

    try {
        const tx = redis.multi().set(key, JSON.stringify(fresh), { ex: ttlSeconds });
        for (const tag of tagsForKey(key)) {
            tx.sadd(tag, key)
              .expire(tag, ttlSeconds, "NX")  // first member: start the TTL
              .expire(tag, ttlSeconds, "GT"); // longer-lived member: extend it
        }
        await withTimeout(tx.exec(), "cache set");
    } catch (err: any) {
        logWithContext("warn", "[Cache] Write failed, returning uncached result", {
            key,
            error: err.message,
        });
    }

    return fresh;
};

// Invalidate one exact key ("sa:dashboard:health") or every key under a
// prefix ("sa:dashboard:*"). Prefix patterns must be TAG_MIN_DEPTH..TAG_MAX_DEPTH
// segments deep, ending in ":*", and only cover keys written via withCache.
export const invalidateCache= async (pattern: string)=>{
    try {
        if (!pattern.includes("*")) {
            await redis.del(pattern);
            return;
        }

        if (!pattern.endsWith(":*") || pattern.indexOf("*") !== pattern.length - 1) {
            throw new Error("Only trailing ':*' prefix patterns are supported");
        }

        const prefix = pattern.slice(0, -2);
        const depth = prefix.split(":").length;
        if (depth < TAG_MIN_DEPTH || depth > TAG_MAX_DEPTH) {
            throw new Error(`Prefix depth ${depth} is not indexed (supported: ${TAG_MIN_DEPTH}-${TAG_MAX_DEPTH})`);
        }

        const tag = TAG_PREFIX + prefix;
        const keys = await redis.smembers(tag);

        for (let i = 0; i < keys.length; i += DEL_BATCH_SIZE) {
            const batch = keys.slice(i, i + DEL_BATCH_SIZE);
            // SREM only what we deleted (not DEL the Set) so a key cached
            // concurrently with this invalidation stays indexed
            await redis.multi().del(...batch).srem(tag, ...batch).exec();
        }
    } catch (err: any) {
        logWithContext("error", "[Cache] Invalidation failed", {
            pattern,
            error: err.message,
        });
    }
};
