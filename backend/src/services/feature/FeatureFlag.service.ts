import crypto from "node:crypto";
import prisma from "../../config/prisma.ts"

type FlagRow = {
    key: string;
    enabled: boolean;
    rolloutType: string;
    rolloutPercentage: number | null;
    enabledFrom: Date | null;
    enabledUntil: Date | null;
    whitelist: string[];
    blacklist: string[];
};

// Stable 0-99 bucket for a tenant and flag, so a percentage rollout keeps
// the same tenants in as the percentage grows
function bucket(key: string, tenantUuid: string): number {
    return crypto.createHash("sha256").update(`${key}:${tenantUuid}`).digest().readUInt32BE(0) % 100;
}

function evaluate(flag: FlagRow, tenantUuid: string, now: Date): boolean {
    if (!flag.enabled) return false;
    if (flag.enabledFrom && now < flag.enabledFrom) return false;
    if (flag.enabledUntil && now > flag.enabledUntil) return false;
    if (flag.blacklist.includes(tenantUuid)) return false;
    if (flag.whitelist.includes(tenantUuid)) return true;
    if (flag.rolloutType === "PERCENTAGE") {
        return bucket(flag.key, tenantUuid) < (flag.rolloutPercentage ?? 0);
    }
    return true;
}

export class FeatureFlagService {
    // Is the feature on for this tenant? A TENANT-scoped flag (the tenant's
    // override) wins over the GLOBAL flag of the same key; no flag means off.
    // Flags are managed at /api/admin/platform/feature-flags.
    static async isEnabled(tenantUuid: string, feature: string): Promise<boolean> {
        const flags = await prisma.featureFlag.findMany({
            where: {
                key: feature,
                isDeprecated: false,
                OR: [
                    { scope: "TENANT", tenantUuid },
                    { scope: "GLOBAL", tenantUuid: null },
                ],
            },
            select: {
                key: true, scope: true, enabled: true, rolloutType: true, rolloutPercentage: true,
                enabledFrom: true, enabledUntil: true, whitelist: true, blacklist: true,
            },
        });
        const flag = flags.find((f) => f.scope === "TENANT") ?? flags.find((f) => f.scope === "GLOBAL");
        return flag ? evaluate(flag, tenantUuid, new Date()) : false;
    }
}
