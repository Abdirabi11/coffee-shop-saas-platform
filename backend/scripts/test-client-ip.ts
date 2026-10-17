// LOCAL CLIENT-IP CHECKS (IP spoofing)
// Real Express apps on loopback, the way server.ts configures them:
//
//   1. No proxy (TRUST_PROXY_HOPS unset/0) - a client-supplied
//      X-Forwarded-For is ignored: the address is the TCP peer.
//   2. One proxy (TRUST_PROXY_HOPS=1) - the address is the entry the proxy
//      appended (rightmost), not the one the client wrote (leftmost).
//   3. The login rate limit can't be dodged by changing X-Forwarded-For.
//   4. TRUST_PROXY_HOPS is validated.
//   5. Nothing outside utils/clientIp.ts parses X-Forwarded-For itself.
//
//   npx tsx scripts/test-client-ip.ts
//
// Exits non-zero if any check fails.
import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { useFakeUpstashIfUnreachable } from "./lib/fake-upstash.ts";

// The rate limiter keeps its counters in Redis
const fakeUpstash = await useFakeUpstashIfUnreachable();
process.env.LOG_LEVEL ??= "fatal";

const { default: express } = await import("express");
const { clientIp, trustProxyHops } = await import("../src/utils/clientIp.ts");
const { loginRateLimit } = await import("../src/middlewares/AuthRateLimit.middleware.ts");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

// An app as server.ts builds it, for a given TRUST_PROXY_HOPS
async function app(hops: string | undefined) {
    const a = express();
    a.set("trust proxy", trustProxyHops(hops));
    a.get("/ip", (req, res) => res.json({ ip: clientIp(req) }));
    a.post("/login", loginRateLimit, (_req, res) => res.json({ ok: true }));
    const server = a.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function ipSeen(base: string, forwardedFor?: string) {
    const res = await fetch(`${base}/ip`, { headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {} });
    return (await res.json()).ip;
}

const servers: Array<{ close: () => void }> = [];
try {
    console.log("\n1. No proxy (TRUST_PROXY_HOPS unset)");
    const direct = await app(undefined);
    servers.push(direct.server);
    check("plain request", await ipSeen(direct.base), "127.0.0.1");
    check("spoofed X-Forwarded-For ignored", await ipSeen(direct.base, "6.6.6.6"), "127.0.0.1");
    check("spoofed list ignored", await ipSeen(direct.base, "6.6.6.6, 7.7.7.7"), "127.0.0.1");

    console.log("\n2. One proxy (TRUST_PROXY_HOPS=1)");
    const proxied = await app("1");
    servers.push(proxied.server);
    // The client wrote 6.6.6.6; the proxy appended the address it saw, 203.0.113.9
    check("the proxy's entry wins", await ipSeen(proxied.base, "6.6.6.6, 203.0.113.9"), "203.0.113.9");
    check("single entry from the proxy", await ipSeen(proxied.base, "203.0.113.9"), "203.0.113.9");

    console.log("\n3. Login rate limit (5 per 15 min) with a new X-Forwarded-For each time, no proxy");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
        const res = await fetch(`${direct.base}/login`, { method: "POST", headers: { "X-Forwarded-For": `10.99.0.${i}` } });
        statuses.push(res.status);
    }
    console.log(`    statuses: ${statuses.join(", ")}`);
    check("attempts allowed", statuses.filter((s) => s === 200).length, 5);
    check("then rate limited", statuses.slice(5).every((s) => s === 429), true);

    console.log("\n4. TRUST_PROXY_HOPS validation");
    const parse = (value: string | undefined) => { try { return String(trustProxyHops(value)); } catch { return "throws"; } };
    check("unset", parse(undefined), "0");
    check("empty", parse(""), "0");
    check("2", parse("2"), "2");
    check("true", parse("true"), "throws");
    check("-1", parse("-1"), "throws");
    check("1.5", parse("1.5"), "throws");

    console.log("\n5. No hand-parsed X-Forwarded-For left in src/");
    const offenders: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith(".ts") && !path.endsWith("utils/clientIp.ts")) {
                if (/headers\[["']x-forwarded-for["']\]/i.test(readFileSync(path, "utf8"))) offenders.push(path);
            }
        }
    };
    walk(new URL("../src", import.meta.url).pathname);
    check("files reading the header directly", offenders.join(", ") || "none", "none");

    console.log(failures === 0 ? "\nAll client-IP checks passed" : `\n${failures} check(s) FAILED`);
} catch (error) {
    console.error("\nClient-IP test crashed:", error);
    failures++;
} finally {
    for (const s of servers) s.close();
    fakeUpstash?.close();
}
process.exit(failures === 0 ? 0 : 1);
