import type { Request } from "express";
import prisma from "../../config/prisma.ts";
import { PermissionManagementService } from "../../services/staff/PermissionManagement.service.ts";
import { RoleAssignmentError, assertStoreInTenant, callerTenantRank, findTenantMember } from "./roleHierarchy.ts";

const TENANT_ADMIN_RANK = 2;

// Which of a staff member's records (shifts, time entries, tips, commission,
// order stats) the caller may read, for routes keyed by /:userUuid.
//
//   - The target must be a member of the verified tenant (404 otherwise).
//   - The user themselves and tenant admins see every store; with an
//     explicit storeUuid, just that store (which must be in the tenant).
//   - Anyone else sees only stores where they hold one of `permissions`:
//     the named store, or else the stores the target is assigned to (plus
//     `extraStores`). None allowed -> 403.
//
// stores undefined means "every store in the tenant". `sensitive` is true for
// the user themselves and tenant admins: pay, tips and commission amounts
// are only for them.
export async function staffRecordScope(
    req: Request,
    targetUserUuid: string,
    options: { permissions: string[]; storeUuid?: unknown; extraStores?: () => Promise<string[]> }
): Promise<{ stores?: string[]; sensitive: boolean }> {
    await findTenantMember(req, { userUuid: targetUserUuid });

    const named = typeof options.storeUuid === "string" && options.storeUuid ? options.storeUuid : undefined;
    if (named) await assertStoreInTenant(req, named);

    const isSelf = targetUserUuid === req.user!.userUuid;
    const isTenantAdmin = callerTenantRank(req) >= TENANT_ADMIN_RANK;
    if (isSelf || isTenantAdmin) {
        return { stores: named ? [named] : undefined, sensitive: true };
    }

    let candidates: string[];
    if (named) {
        candidates = [named];
    } else {
        const assignments = await prisma.userStore.findMany({
            where: { tenantUuid: req.tenant!.uuid, userUuid: targetUserUuid },
            select: { storeUuid: true },
        });
        candidates = [...new Set([
            ...assignments.map((a) => a.storeUuid),
            ...(options.extraStores ? await options.extraStores() : []),
        ])];
    }

    const allowed: string[] = [];
    for (const storeUuid of candidates) {
        for (const permissionSlug of options.permissions) {
            if (await PermissionManagementService.hasPermission({ userUuid: req.user!.userUuid, storeUuid, permissionSlug })) {
                allowed.push(storeUuid);
                break;
            }
        }
    }
    if (allowed.length === 0) throw new RoleAssignmentError("FORBIDDEN", 403);

    return { stores: allowed, sensitive: false };
}
