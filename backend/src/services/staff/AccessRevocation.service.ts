import prisma from "../../config/prisma.ts";
import { EventBus } from "../../events/eventBus.ts";
import { invalidateCache } from "../../infrastructure/cache/cache.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { CashDrawerService } from "./CashDrawer.service.ts";
import { TimeEntryService } from "./TimeEntry.service.ts";

// The one way staff lose access to a tenant, whether a tenant admin removes
// them (TenantStaff removeStaff) or they are terminated (StaffManagement
// terminateStaff). Before this, removal left their store assignments active,
// so a removed manager's PIN still authorised voids, and neither path ended
// their login or their open sockets.
//
// In one transaction:
//   - tenant membership and every store assignment in the tenant inactive
//   - their open time entry clocked out (flagged for approval), their open
//     cash drawer taken out of service for a manager to count, future
//     shifts in the tenant cancelled
//   - signed out: tokenVersion is per user, so the bump ends every access
//     and refresh token they hold, in every tenant; refresh tokens and
//     sessions are revoked too. They sign in again wherever they still
//     belong.
// After it commits, their open sockets are disconnected (USER_ACCESS_REVOKED,
// DashboardSocket); a reconnect with an old token fails the handshake.
//
// The global User row is not marked terminated: they may work for another
// tenant.
export class AccessRevocationService {

    static async revokeTenantAccess(input: {
        tenantUuid: string;
        userUuid: string;
        revokedBy: string;
        reason: string;
        endDate?: Date; // when membership ended (default: now)
    }) {
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const member = await tx.tenantUser.findUnique({
                where: { tenantUuid_userUuid: { tenantUuid: input.tenantUuid, userUuid: input.userUuid } },
                select: { uuid: true },
            });
            if (!member) {
                throw new Error("STAFF_NOT_FOUND");
            }

            await tx.tenantUser.update({
                where: { uuid: member.uuid },
                data: { isActive: false, endDate: input.endDate ?? now },
            });

            const assignments = await tx.userStore.findMany({
                where: { tenantUuid: input.tenantUuid, userUuid: input.userUuid, isActive: true },
                select: { storeUuid: true },
            });
            await tx.userStore.updateMany({
                where: { tenantUuid: input.tenantUuid, userUuid: input.userUuid, isActive: true },
                data: { isActive: false, endDate: now },
            });

            const openEntries = await tx.timeEntry.findMany({
                where: { tenantUuid: input.tenantUuid, userUuid: input.userUuid, clockOutAt: null },
                select: { uuid: true, clockInAt: true, payRate: true, shiftUuid: true },
            });
            for (const entry of openEntries) {
                await TimeEntryService.closeEntry(tx, entry, {
                    at: now,
                    autoReason: `Auto clocked out: access revoked (${input.reason})`,
                });
            }

            const openDrawers = await tx.cashDrawer.findMany({
                where: { tenantUuid: input.tenantUuid, userUuid: input.userUuid, status: "OPEN" },
                select: { uuid: true },
            });
            let drawersClosed = 0;
            for (const drawer of openDrawers) {
                const closed = await CashDrawerService.autoClose(tx, {
                    tenantUuid: input.tenantUuid,
                    drawerUuid: drawer.uuid,
                    closedBy: input.revokedBy,
                    reason: input.reason,
                });
                if (closed) drawersClosed++;
            }

            const shifts = await tx.shift.updateMany({
                where: {
                    tenantUuid: input.tenantUuid,
                    userUuid: input.userUuid,
                    status: "SCHEDULED",
                    scheduledStart: { gte: now },
                },
                data: { status: "CANCELLED" },
            });

            await tx.user.update({
                where: { uuid: input.userUuid },
                data: { tokenVersion: { increment: 1 } },
            });

            const refreshTokens = await tx.refreshToken.updateMany({
                where: { userUuid: input.userUuid, status: "ACTIVE" },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: input.revokedBy,
                    revokedReason: "ADMIN_REVOKE",
                },
            });

            const sessions = await tx.session.updateMany({
                where: { userUuid: input.userUuid, status: "ACTIVE" },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: input.revokedBy,
                    revokedReason: `Access revoked: ${input.reason}`,
                },
            });

            return {
                storeUuids: assignments.map((a) => a.storeUuid),
                storeAssignmentsRevoked: assignments.length,
                timeEntriesClosed: openEntries.length,
                drawersClosed,
                shiftsCancelled: shifts.count,
                refreshTokensRevoked: refreshTokens.count,
                sessionsRevoked: sessions.count,
            };
        });

        // After the commit: drop their live sockets (awaited, so the caller
        // returns with them gone)
        await EventBus.emit("USER_ACCESS_REVOKED", {
            tenantUuid: input.tenantUuid,
            userUuid: input.userUuid,
            revokedBy: input.revokedBy,
            reason: input.reason,
        });

        await invalidateCache(`staff:user:${input.userUuid}`).catch(() => {});
        await invalidateCache(`staff:tenant:${input.tenantUuid}`).catch(() => {});
        for (const storeUuid of result.storeUuids) {
            await invalidateCache(`staff:store:${storeUuid}`).catch(() => {});
        }

        const { storeUuids, ...summary } = result;
        logWithContext("info", "[AccessRevocation] Tenant access revoked", {
            tenantUuid: input.tenantUuid,
            userUuid: input.userUuid,
            revokedBy: input.revokedBy,
            reason: input.reason,
            ...summary,
        });
        MetricsService.increment("staff.access_revoked", 1);

        return summary;
    }
}
