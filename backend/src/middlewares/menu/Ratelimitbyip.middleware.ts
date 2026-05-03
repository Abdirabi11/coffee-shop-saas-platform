import type { Request, Response, NextFunction } from "express";
 
const ipHits = new Map<string, { count: number; resetAt: number }>();
 
export function rateLimitByIP(options: { points: number; duration: number }) {
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