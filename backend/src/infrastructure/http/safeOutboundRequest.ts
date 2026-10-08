import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

// Outbound HTTP to URLs that tenants control (webhook endpoints).
//
// A tenant must not be able to make the server talk to itself, the private
// network or the cloud metadata service (SSRF). Every address is checked:
//   - when the URL is saved (validateOutboundUrl), for a clear 400, and
//   - again at connect time, on the address the socket actually connects to
//     (custom DNS lookup), so a hostname that resolves to a public IP when
//     saved and to 169.254.169.254 later (DNS rebinding) is still refused.
// Redirects are never followed: a 3xx is returned as a failed response.

// One list per family: a BlockList also checks IPv4 addresses against its
// IPv6 rules (as ::ffff:a.b.c.d), so ::ffff:0:0/96 would block every IPv4
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();

const BLOCKED_IPV4: [string, number][] = [
    ["0.0.0.0", 8],         // "this network", 0.0.0.0
    ["10.0.0.0", 8],        // private
    ["100.64.0.0", 10],     // carrier-grade NAT
    ["127.0.0.0", 8],       // loopback
    ["169.254.0.0", 16],    // link-local, incl. cloud metadata 169.254.169.254
    ["172.16.0.0", 12],     // private
    ["192.0.0.0", 24],      // IETF protocol assignments
    ["192.0.2.0", 24],      // documentation
    ["192.168.0.0", 16],    // private
    ["198.18.0.0", 15],     // benchmarking
    ["198.51.100.0", 24],   // documentation
    ["203.0.113.0", 24],    // documentation
    ["224.0.0.0", 4],       // multicast
    ["240.0.0.0", 4],       // reserved, incl. 255.255.255.255
];
const BLOCKED_IPV6: [string, number][] = [
    ["::", 96],             // unspecified, loopback ::1, IPv4-compatible
    ["::ffff:0:0", 96],     // IPv4-mapped (::ffff:127.0.0.1)
    ["64:ff9b::", 96],      // NAT64 (embeds an IPv4 address)
    ["100::", 64],          // discard
    ["2001::", 32],         // Teredo (embeds an IPv4 address)
    ["2001:db8::", 32],     // documentation
    ["2002::", 16],         // 6to4 (embeds an IPv4 address)
    ["fc00::", 7],          // unique local
    ["fe80::", 10],         // link-local
    ["fec0::", 10],         // site-local (deprecated)
    ["ff00::", 8],          // multicast
];
for (const [address, prefix] of BLOCKED_IPV4) BLOCKED_V4.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of BLOCKED_IPV6) BLOCKED_V6.addSubnet(address, prefix, "ipv6");

// True if the server must not connect to this address (fails closed on
// anything that isn't an IP address)
export function isBlockedAddress(address: string): boolean {
    const family = net.isIP(address);
    if (family === 4) return BLOCKED_V4.check(address, "ipv4");
    if (family === 6) return BLOCKED_V6.check(address, "ipv6");
    return true;
}

export class OutboundUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OutboundUrlError";
    }
}

type AddressCheck = (address: string) => boolean;

function parseOutboundUrl(rawUrl: string): URL {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new OutboundUrlError("URL is not valid");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new OutboundUrlError("URL must use http or https");
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
        throw new OutboundUrlError("URL must use https");
    }
    if (url.username || url.password) {
        throw new OutboundUrlError("URL must not contain credentials");
    }
    return url;
}

// URL hostnames keep IPv6 literals in brackets
const bareHost = (url: URL) => url.hostname.replace(/^\[(.*)\]$/, "$1");

// For saving a URL: shape, scheme, and every address the host resolves to
// right now. Throws OutboundUrlError.
export async function validateOutboundUrl(rawUrl: string, isBlocked: AddressCheck = isBlockedAddress): Promise<URL> {
    const url = parseOutboundUrl(rawUrl);
    const host = bareHost(url);

    if (net.isIP(host)) {
        if (isBlocked(host)) throw new OutboundUrlError("URL points to a private or reserved address");
        return url;
    }

    let addresses: dns.LookupAddress[];
    try {
        addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
    } catch {
        throw new OutboundUrlError("URL host could not be resolved");
    }
    if (addresses.length === 0 || addresses.some((a) => isBlocked(a.address))) {
        throw new OutboundUrlError("URL points to a private or reserved address");
    }
    return url;
}

// dns.lookup replacement for http(s).request: resolves, then refuses the
// connection if any resolved address is blocked
function guardedLookup(isBlocked: AddressCheck): net.LookupFunction {
    return (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
            if (error) return callback(error, "", 0);
            const list = addresses as dns.LookupAddress[];
            if (list.length === 0 || list.some((a) => isBlocked(a.address))) {
                return callback(new OutboundUrlError("Destination address is not allowed"), "", 0);
            }
            if ((options as dns.LookupOptions).all) return (callback as any)(null, list);
            callback(null, list[0].address, list[0].family);
        });
    };
}

// Headers a tenant must not set on our request
const RESERVED_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "upgrade", "te", "trailer"]);

export interface OutboundResponse {
    ok: boolean;
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    durationMs: number;
}

export async function sendOutboundRequest(input: {
    url: string;
    method?: string;
    headers?: Record<string, unknown>;
    body?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
    // Tests only: a looser address check, to reach a local test server
    isBlocked?: AddressCheck;
}): Promise<OutboundResponse> {
    const isBlocked = input.isBlocked ?? isBlockedAddress;
    const url = parseOutboundUrl(input.url);
    const host = bareHost(url);
    // IP literals never go through the lookup: check them here
    if (net.isIP(host) && isBlocked(host)) {
        throw new OutboundUrlError("Destination address is not allowed");
    }

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(input.headers ?? {})) {
        if (value === undefined || value === null || RESERVED_HEADERS.has(name.toLowerCase())) continue;
        headers[name] = String(value);
    }
    if (input.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(input.body));

    const maxBytes = input.maxResponseBytes ?? 10_000;
    const started = Date.now();
    const transport = url.protocol === "https:" ? https : http;

    return new Promise<OutboundResponse>((resolve, reject) => {
        const request = transport.request(url, {
            method: input.method ?? "POST",
            headers,
            lookup: guardedLookup(isBlocked),
            timeout: input.timeoutMs ?? 30_000,
        }, (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            const finish = () => {
                const status = response.statusCode ?? 0;
                resolve({
                    // A redirect is a failure: it is never followed
                    ok: status >= 200 && status < 300,
                    status,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString("utf8").slice(0, maxBytes),
                    durationMs: Date.now() - started,
                });
            };
            response.on("data", (chunk: Buffer) => {
                if (size < maxBytes) chunks.push(chunk);
                size += chunk.length;
                if (size >= maxBytes) {
                    response.destroy();
                    finish();
                }
            });
            response.on("end", finish);
            response.on("error", reject);
        });
        request.on("timeout", () => {
            const error = new Error("Request timed out");
            error.name = "TimeoutError";
            request.destroy(error);
        });
        request.on("error", reject);
        request.end(input.body);
    });
}
