import type { Request } from "express";

// How many reverse proxies (Nginx, a load balancer...) sit in front of the
// app, from TRUST_PROXY_HOPS. server.ts hands it to Express as "trust proxy".
//
// Default 0: no proxy, so req.ip is the TCP peer (req.socket.remoteAddress)
// and X-Forwarded-For is ignored. Behind N proxies set it to N: Express then
// takes the client from the X-Forwarded-For entries those proxies appended,
// counting from the right, never the leftmost entry the client wrote itself.
// Too high a value lets clients choose their own address; too low makes
// every client look like the proxy (one shared rate-limit bucket).
export function trustProxyHops(value: string | undefined = process.env.TRUST_PROXY_HOPS): number {
    if (value === undefined || value.trim() === "") return 0;
    const hops = Number(value);
    if (!Number.isInteger(hops) || hops < 0) {
        throw new Error(`TRUST_PROXY_HOPS must be a whole number >= 0, got "${value}"`);
    }
    return hops;
}

// The client's IP address, for rate limits, sessions and audit records.
// Always go through this (req.ip, resolved by Express from the trust proxy
// setting); never read X-Forwarded-For directly.
export function clientIp(req: Pick<Request, "ip" | "socket">): string {
    const ip = req.ip || req.socket?.remoteAddress;
    if (!ip) return "unknown";
    // IPv4 clients on a dual-stack socket show up as ::ffff:a.b.c.d
    return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}
