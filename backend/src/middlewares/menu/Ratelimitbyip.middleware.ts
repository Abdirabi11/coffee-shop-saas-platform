import type { Request, Response, NextFunction } from "express";
 
type HitEntry = { count: number; resetAt: number };

// One map per rateLimitByIP() instance so separate limits (menu browsing vs.
// PIN login) don't share a counter. Entries are only replaced when the same
// IP returns, so expired ones are swept periodically to stop the maps growing
// with every distinct IP ever seen.
// NOTE: per-process; limits are not shared across server instances.
const limiterStores = new Set<Map<string, HitEntry>>();

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export function pruneExpiredIpHits(now: number = Date.now()): number {
    let removed = 0;
    for (const store of limiterStores) {
        for (const [ip, entry] of store) {
            if (now > entry.resetAt) {
                store.delete(ip);
                removed++;
            }
        }
    }
    return removed;
}

// unref() so the timer never keeps the process alive on shutdown
setInterval(pruneExpiredIpHits, CLEANUP_INTERVAL_MS).unref();
 
export function rateLimitByIP(options: { points: number; duration: number }) {
    const ipHits = new Map<string, HitEntry>();
    limiterStores.add(ipHits);

    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const entry = ipHits.get(ip);
 
        if (!entry || now > entry.resetAt) {
            ipHits.set(ip, { count: 1, resetAt: now + options.duration * 1000 });
            return next();
        }
 
        entry.count++;
 
        if (entry.count > options.points) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.set("Retry-After", String(retryAfter));
            return res.status(429).json({
                success: false,
                error: "TOO_MANY_REQUESTS",
                message: `Rate limit exceeded. Try again in ${retryAfter}s`,
            });
        }
 
        next();
    };
}