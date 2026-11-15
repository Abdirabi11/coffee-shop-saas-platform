import net from "node:net";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { redis } from "../../lib/redis.ts";

// A tenant's active rules, cached as one entry and dropped whenever a rule is
// added or removed, so a change applies on the next check
type CachedRule = {
    ipAddress: string | null;
    ipRange: string | null;
    allowedFor: string[];
    expiresAt: string | null;
};

const RULES_TTL_SECONDS = 300;
const rulesKey = (tenantUuid: string) => `ip:whitelist:rules:${tenantUuid}`;

// "::ffff:10.0.0.5" (an IPv4 client on a dual-stack socket) -> "10.0.0.5"
function normalizeIP(ip: string): string {
    const trimmed = ip.trim();
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
    return mapped ? mapped[1] : trimmed;
}

function ipFamily(ip: string): "ipv4" | "ipv6" | null {
    const version = net.isIP(ip);
    return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null;
}

// "10.0.0.0/8" -> { network, prefix, family }, or null if it isn't a CIDR block
function parseCIDR(range: string): { network: string; prefix: number; family: "ipv4" | "ipv6" } | null {
    const [network, bits, extra] = range.trim().split("/");
    if (extra !== undefined || !network || !bits || !/^\d{1,3}$/.test(bits)) return null;
    const family = ipFamily(network);
    const prefix = Number(bits);
    if (!family || prefix > (family === "ipv4" ? 32 : 128)) return null;
    return { network, prefix, family };
}

function ruleMatches(rule: CachedRule, ip: string): boolean {
    if (rule.ipAddress && normalizeIP(rule.ipAddress) === ip) return true;
    if (!rule.ipRange) return false;

    const cidr = parseCIDR(rule.ipRange);
    const family = ipFamily(ip);
    if (!cidr || !family) return false;

    const block = new net.BlockList();
    block.addSubnet(cidr.network, cidr.prefix, cidr.family);
    return block.check(ip, family);
}

export class IPWhitelistService {
    // Whether the IP may perform the operation for the tenant. Fails closed.
    static async isIPWhitelisted(input: {
        tenantUuid: string;
        ipAddress: string;
        operation: string; // e.g., "ADMIN_ACCESS", "PAYMENT_CONFIG"
    }): Promise<boolean> {
        try {
            const ip = normalizeIP(input.ipAddress);
            if (!ipFamily(ip)) return false;

            const now = Date.now();
            const rules = await this.activeRules(input.tenantUuid);

            return rules.some((rule) => {
                if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now) return false;
                if (!rule.allowedFor.includes("*") && !rule.allowedFor.includes(input.operation)) return false;
                return ruleMatches(rule, ip);
            });
        } catch (error: any) {
            logWithContext("error", "[IPWhitelist] Failed to check IP", {
                error: error.message,
                ipAddress: input.ipAddress,
            });
            return false;
        }
    }

    // A rule is one address or one CIDR block. Throws INVALID_IP_RULE,
    // INVALID_IP_ADDRESS or INVALID_IP_RANGE for bad input.
    static async addIP(input: {
        tenantUuid: string;
        ipAddress?: string;
        ipRange?: string;
        description?: string;
        allowedFor: string[]; // Operations this IP can perform
        expiresAt?: Date;
        addedBy: string;
    }) {
        const ipAddress = input.ipAddress?.trim() ? normalizeIP(input.ipAddress) : undefined;
        const ipRange = input.ipRange?.trim() || undefined;

        if (!ipAddress === !ipRange) throw new Error("INVALID_IP_RULE");
        if (ipAddress && !ipFamily(ipAddress)) throw new Error("INVALID_IP_ADDRESS");
        if (ipRange && !parseCIDR(ipRange)) throw new Error("INVALID_IP_RANGE");

        const whitelist = await prisma.iPWhitelist.create({
            data: {
                tenantUuid: input.tenantUuid,
                ipAddress,
                ipRange,
                description: input.description,
                allowedFor: input.allowedFor,
                expiresAt: input.expiresAt,
                addedBy: input.addedBy,
                isActive: true,
            },
        });

        await this.invalidate(input.tenantUuid);

        logWithContext("info", "[IPWhitelist] Rule added", {
            tenantUuid: input.tenantUuid,
            ipAddress,
            ipRange,
            addedBy: input.addedBy,
        });

        return whitelist;
    }

    // Deactivates a rule of this tenant. Returns false if there is none.
    static async removeIP(input: {
        tenantUuid: string;
        whitelistUuid: string;
        removedBy: string;
    }): Promise<boolean> {
        const result = await prisma.iPWhitelist.updateMany({
            where: { uuid: input.whitelistUuid, tenantUuid: input.tenantUuid, isActive: true },
            data: { isActive: false },
        });
        if (result.count === 0) return false;

        await this.invalidate(input.tenantUuid);

        logWithContext("info", "[IPWhitelist] Rule removed", {
            tenantUuid: input.tenantUuid,
            whitelistUuid: input.whitelistUuid,
            removedBy: input.removedBy,
        });
        return true;
    }

    static async listIPs(tenantUuid: string) {
        return prisma.iPWhitelist.findMany({
            where: { tenantUuid, isActive: true },
            orderBy: { createdAt: "desc" },
        });
    }

    private static async activeRules(tenantUuid: string): Promise<CachedRule[]> {
        try {
            // @upstash/redis returns the stored JSON already parsed
            const cached = await redis.get<CachedRule[]>(rulesKey(tenantUuid));
            if (Array.isArray(cached)) return cached;
        } catch (error: any) {
            logWithContext("warn", "[IPWhitelist] Cache read failed", { tenantUuid, error: error.message });
        }

        const rows = await prisma.iPWhitelist.findMany({
            where: { tenantUuid, isActive: true },
            select: { ipAddress: true, ipRange: true, allowedFor: true, expiresAt: true },
        });
        const rules: CachedRule[] = rows.map((row) => ({
            ipAddress: row.ipAddress,
            ipRange: row.ipRange,
            allowedFor: Array.isArray(row.allowedFor) ? row.allowedFor.filter((v): v is string => typeof v === "string") : [],
            expiresAt: row.expiresAt?.toISOString() ?? null,
        }));

        await redis.setex(rulesKey(tenantUuid), RULES_TTL_SECONDS, JSON.stringify(rules)).catch((error: any) => {
            logWithContext("warn", "[IPWhitelist] Cache write failed", { tenantUuid, error: error.message });
        });
        return rules;
    }

    private static async invalidate(tenantUuid: string) {
        // A failed delete leaves the old rules for at most RULES_TTL_SECONDS
        await redis.del(rulesKey(tenantUuid)).catch((error: any) => {
            logWithContext("error", "[IPWhitelist] Cache invalidation failed", { tenantUuid, error: error.message });
        });
    }
}
