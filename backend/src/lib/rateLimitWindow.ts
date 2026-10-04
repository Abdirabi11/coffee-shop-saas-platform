import { redis } from "./redis.ts";

// Fixed-window counter for rate limiting.
//
// INCR, PEXPIRE and PTTL run as one MULTI/EXEC transaction, so the counter
// can never exist without a TTL (the old INCR-then-EXPIRE pair left a key
// with no expiry, i.e. a permanent lockout, if the second call failed).
// PEXPIRE NX only sets the TTL when the key has none, which keeps the window
// fixed and also repairs any key left without a TTL by the old code.
export async function hitRateLimitWindow(
    key: string,
    windowMs: number
): Promise<{ count: number; ttlMs: number }> {
    const [count, , ttlMs] = await redis
        .multi()
        .incr(key)
        .pexpire(key, windowMs, "NX")
        .pttl(key)
        .exec<[number, number, number]>();

    return { count, ttlMs: ttlMs > 0 ? ttlMs : windowMs };
}
