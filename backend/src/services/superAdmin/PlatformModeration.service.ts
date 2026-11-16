import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { invalidateOnTenantEvent } from "../../infrastructure/cache/superAdmin.cache.ts";
import { PlatformSettingsError } from "./PlatformSettings.service.ts";

// Super admin actions on tenants and user accounts.
//
// A suspended tenant (status SUSPENDED) is refused by requireTenantContext
// on every request (403 TENANT_SUSPENDED), so its staff and admins are cut
// off at once; reactivating restores access.
//
// A banned user is refused by authenticate (401) on the next request: the
// ban bumps tokenVersion, which voids every access token already issued,
// and revokes all refresh tokens and sessions so none can be renewed.
export class PlatformModerationService {
    static async suspendTenant(input: { tenantUuid: string; reason: string; actorUuid: string }) {
        const tenant = await prisma.tenant.findUnique({
            where: { uuid: input.tenantUuid },
            select: { uuid: true, status: true },
        });
        if (!tenant) throw new PlatformSettingsError("TENANT_NOT_FOUND", 404);
        if (tenant.status === "SUSPENDED") throw new PlatformSettingsError("TENANT_ALREADY_SUSPENDED", 409);

        const updated = await prisma.tenant.update({
            where: { uuid: input.tenantUuid },
            data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: input.reason },
            select: { uuid: true, name: true, status: true, suspendedAt: true, suspendedReason: true },
        });

        await invalidateOnTenantEvent().catch(() => {});
        logWithContext("warn", "[PlatformModeration] Tenant suspended", {
            tenantUuid: input.tenantUuid,
            previousStatus: tenant.status,
            reason: input.reason,
            actorUuid: input.actorUuid,
        });
        return updated;
    }

    static async reactivateTenant(input: { tenantUuid: string; actorUuid: string }) {
        const tenant = await prisma.tenant.findUnique({
            where: { uuid: input.tenantUuid },
            select: { uuid: true, status: true },
        });
        if (!tenant) throw new PlatformSettingsError("TENANT_NOT_FOUND", 404);
        if (tenant.status !== "SUSPENDED") throw new PlatformSettingsError("TENANT_NOT_SUSPENDED", 409);

        const updated = await prisma.tenant.update({
            where: { uuid: input.tenantUuid },
            data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
            select: { uuid: true, name: true, status: true, suspendedAt: true, suspendedReason: true },
        });

        await invalidateOnTenantEvent().catch(() => {});
        logWithContext("info", "[PlatformModeration] Tenant reactivated", {
            tenantUuid: input.tenantUuid,
            actorUuid: input.actorUuid,
        });
        return updated;
    }

    static async banUser(input: { userUuid: string; reason: string; actorUuid: string }) {
        if (input.userUuid === input.actorUuid) throw new PlatformSettingsError("CANNOT_BAN_SELF", 400);

        const user = await prisma.user.findUnique({
            where: { uuid: input.userUuid },
            select: { uuid: true, isBanned: true, globalRole: true },
        });
        if (!user) throw new PlatformSettingsError("USER_NOT_FOUND", 404);
        // Another super admin is demoted first, never banned from here
        if (user.globalRole === "SUPER_ADMIN") throw new PlatformSettingsError("CANNOT_BAN_SUPER_ADMIN", 403);
        if (user.isBanned) throw new PlatformSettingsError("USER_ALREADY_BANNED", 409);

        const now = new Date();
        const [updated, tokens, sessions] = await prisma.$transaction([
            prisma.user.update({
                where: { uuid: input.userUuid },
                data: {
                    isBanned: true,
                    isGloballyBanned: true,
                    bannedAt: now,
                    banReason: input.reason,
                    bannedBy: input.actorUuid,
                    tokenVersion: { increment: 1 },
                },
                select: { uuid: true, isBanned: true, bannedAt: true, banReason: true },
            }),
            prisma.refreshToken.updateMany({
                where: { userUuid: input.userUuid, revoked: false },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: input.actorUuid,
                    revokedReason: "ADMIN_REVOKE",
                },
            }),
            prisma.session.updateMany({
                where: { userUuid: input.userUuid, revoked: false },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: input.actorUuid,
                    revokedReason: "Account banned",
                },
            }),
        ]);

        logWithContext("warn", "[PlatformModeration] User banned", {
            userUuid: input.userUuid,
            reason: input.reason,
            actorUuid: input.actorUuid,
            refreshTokensRevoked: tokens.count,
            sessionsRevoked: sessions.count,
        });
        return { ...updated, refreshTokensRevoked: tokens.count, sessionsRevoked: sessions.count };
    }

    // Lifts the ban; the user signs in again (old tokens stay void)
    static async unbanUser(input: { userUuid: string; actorUuid: string }) {
        const user = await prisma.user.findUnique({
            where: { uuid: input.userUuid },
            select: { uuid: true, isBanned: true, isGloballyBanned: true },
        });
        if (!user) throw new PlatformSettingsError("USER_NOT_FOUND", 404);
        if (!user.isBanned && !user.isGloballyBanned) throw new PlatformSettingsError("USER_NOT_BANNED", 409);

        const updated = await prisma.user.update({
            where: { uuid: input.userUuid },
            data: { isBanned: false, isGloballyBanned: false, bannedAt: null, banReason: null, bannedBy: null },
            select: { uuid: true, isBanned: true },
        });

        logWithContext("info", "[PlatformModeration] User unbanned", {
            userUuid: input.userUuid,
            actorUuid: input.actorUuid,
        });
        return updated;
    }
}
