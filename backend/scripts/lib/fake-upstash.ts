// In-memory stand-in for Upstash Redis, for local test scripts.
//
// The app's cache and rate-limit calls go to Upstash over HTTP. When it is
// unreachable each call waits out the client's retries, and menu loads
// used to fail outright, so scripts point UPSTASH_REDIS_REST_URL at this
// minimal server instead. Must run before src/lib/redis.ts is imported.
import http from "node:http";
import type { AddressInfo } from "node:net";

async function upstashReachable(): Promise<boolean> {
    try {
        const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
            headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function startFakeUpstash(): Promise<http.Server> {
    const data = new Map<string, string>();
    const run = ([cmd, ...args]: string[]): unknown => {
        switch (cmd.toUpperCase()) {
            case "PING": return "PONG";
            case "GET": return data.get(args[0]) ?? null;
            case "SET": data.set(args[0], String(args[1])); return "OK";
            case "DEL": return args.filter((k) => data.delete(k)).length;
            case "INCR": {
                const next = Number(data.get(args[0]) ?? 0) + 1;
                data.set(args[0], String(next));
                return next;
            }
            default: return 1; // SADD / EXPIRE / rate-limit bookkeeping
        }
    };
    // The client asks for base64 responses and decodes every string but "OK"
    const encode = (v: unknown) => (typeof v === "string" && v !== "OK" ? Buffer.from(v).toString("base64") : v);

    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            const parsed = JSON.parse(body || "[]");
            const batch = req.url?.startsWith("/pipeline") || req.url?.startsWith("/multi-exec");
            const out = batch
                ? parsed.map((c: string[]) => ({ result: encode(run(c)) }))
                : { result: encode(run(parsed)) };
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(out));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
}

// Starts the stand-in and points the app at it if the real Upstash can't be
// reached (skip with --real-redis). Returns the server so the caller can
// close it; undefined if the real one is used.
export async function useFakeUpstashIfUnreachable(): Promise<http.Server | undefined> {
    if (process.argv.includes("--real-redis") || (await upstashReachable())) return undefined;
    const server = await startFakeUpstash();
    process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return server;
}
