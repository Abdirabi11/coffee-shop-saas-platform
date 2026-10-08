import type { Request } from "express";
import prisma from "../../config/prisma.ts";

// Who may give which role to whom.
//
// Tenant level (TenantUser.role, plus OWNER from Tenant.ownerUuid):
//   STAFF (plain membership) < REGIONAL_MANAGER < TENANT_ADMIN < OWNER < SUPER_ADMIN
// Store level (UserStore.role):
//   CASHIER/BARISTA/KITCHEN_STAFF/STAFF < SHIFT_SUPERVISOR < MANAGER/STORE_MANAGER < ADMIN
//   Tenant admins, owners and super admins outrank every store role.
//
// Rules:
//   - A caller can only assign roles strictly below their own rank. Two
//     exceptions: plain STAFF membership is assignable by anyone allowed to
//     manage staff, and OWNER / TENANT_ADMIN may make other TENANT_ADMINs.
//   - A caller can only change people strictly below them: never themselves,
//     never the tenant owner, never a peer (two TENANT_ADMINs, two MANAGERs).
//     For store changes the caller must outrank the target at that store.

const TENANT_ROLE_RANK: Record<string, number> = { STAFF: 0, REGIONAL_MANAGER: 1, TENANT_ADMIN: 2 };
const OWNER_RANK = 3;
const SUPER_ADMIN_RANK = 4;

const STORE_ROLE_RANK: Record<string, number> = {
    STAFF: 1, BARISTA: 1, KITCHEN_STAFF: 1, CASHIER: 1,
    SHIFT_SUPERVISOR: 2,
    MANAGER: 3, STORE_MANAGER: 3,
    ADMIN: 4,
};
// Tenant admins and above administer every store in the tenant
const TENANT_ADMIN_STORE_RANK = 5;

export class RoleAssignmentError extends Error {
    constructor(public code: string, public status: number) {
        super(code);
    }
}

const forbid = (code: string) => new RoleAssignmentError(code, 403);

// ── Ranks ───────────────────────────────────────────────────────────────────

export function callerTenantRank(req: Request): number {
    if (req.user?.globalRole === "SUPER_ADMIN") return SUPER_ADMIN_RANK;
    if (req.tenant && req.tenant.ownerUuid === req.user?.userUuid) return OWNER_RANK;
    return TENANT_ROLE_RANK[req.tenantUser?.role ?? ""] ?? 0;
}

function memberTenantRank(tenantOwnerUuid: string, member: { userUuid: string; role: string }): number {
    if (member.userUuid === tenantOwnerUuid) return OWNER_RANK;
    return TENANT_ROLE_RANK[member.role] ?? 0;
}

async function storeRank(tenantUuid: string, userUuid: string, storeUuid: string): Promise<number> {
    const assignment = await prisma.userStore.findFirst({
        where: { tenantUuid, userUuid, storeUuid, isActive: true },
        select: { role: true },
    });
    return assignment ? (STORE_ROLE_RANK[assignment.role] ?? 0) : 0;
}

export async function callerStoreRank(req: Request, storeUuid: string): Promise<number> {
    if (callerTenantRank(req) >= TENANT_ROLE_RANK.TENANT_ADMIN) return TENANT_ADMIN_STORE_RANK;
    return storeRank(req.tenant!.uuid, req.user!.userUuid, storeUuid);
}

// ── Checks (throw RoleAssignmentError) ──────────────────────────────────────

export async function assertStoreInTenant(req: Request, storeUuid: unknown) {
    const store = typeof storeUuid === "string"
        ? await prisma.store.findFirst({ where: { uuid: storeUuid, tenantUuid: req.tenant!.uuid }, select: { uuid: true } })
        : null;
    if (!store) throw new RoleAssignmentError("STORE_NOT_FOUND", 404);
}

export function assertCanAssignTenantRole(req: Request, role: unknown) {
    if (typeof role !== "string" || !(role in TENANT_ROLE_RANK)) {
        throw new RoleAssignmentError("ROLE_INVALID", 400);
    }
    const caller = callerTenantRank(req);
    if (role === "STAFF") return;
    if (role === "TENANT_ADMIN" && caller >= TENANT_ROLE_RANK.TENANT_ADMIN) return;
    if (TENANT_ROLE_RANK[role] < caller) return;
    throw forbid("ROLE_NOT_ASSIGNABLE");
}

export async function assertCanAssignStoreRole(req: Request, storeUuid: string, role: unknown) {
    if (typeof role !== "string" || !(role in STORE_ROLE_RANK)) {
        throw new RoleAssignmentError("ROLE_INVALID", 400);
    }
    if (STORE_ROLE_RANK[role] >= (await callerStoreRank(req, storeUuid))) {
        throw forbid("ROLE_NOT_ASSIGNABLE");
    }
}

// The target's tenant membership, or 404 if they aren't a member here
export async function findTenantMember(req: Request, where: { uuid?: string; userUuid?: string }) {
    const member = await prisma.tenantUser.findFirst({
        where: { ...where, tenantUuid: req.tenant!.uuid },
        select: { uuid: true, userUuid: true, role: true },
    });
    if (!member) throw new RoleAssignmentError("STAFF_NOT_FOUND", 404);
    return member;
}

// Tenant-level change (role, deactivation, removal) to a membership
export function assertCanModifyTenantMember(req: Request, target: { userUuid: string; role: string }) {
    if (target.userUuid === req.user!.userUuid) throw forbid("CANNOT_MODIFY_SELF");
    if (memberTenantRank(req.tenant!.ownerUuid, target) >= callerTenantRank(req)) {
        throw forbid("TARGET_ROLE_TOO_HIGH");
    }
}

// Store-level change to the target's access at one store
export async function assertCanModifyStoreMember(
    req: Request,
    target: { userUuid: string; role: string },
    storeUuid: string
) {
    if (target.userUuid === req.user!.userUuid) throw forbid("CANNOT_MODIFY_SELF");

    // Tenant admins / the owner can only be changed by someone above them
    const targetTenant = memberTenantRank(req.tenant!.ownerUuid, target);
    if (targetTenant >= TENANT_ROLE_RANK.TENANT_ADMIN && targetTenant >= callerTenantRank(req)) {
        throw forbid("TARGET_ROLE_TOO_HIGH");
    }

    const targetStore = await storeRank(req.tenant!.uuid, target.userUuid, storeUuid);
    if (targetStore >= (await callerStoreRank(req, storeUuid))) throw forbid("TARGET_ROLE_TOO_HIGH");
}

// Change that affects the target everywhere in the tenant (terminate, profile
// edits): tenant-level staff need a higher tenant rank; plain staff need the
// caller to outrank them at every store they're assigned to in this tenant
// (members with no store at all need a tenant admin).
export async function assertCanModifyStaffMember(req: Request, target: { userUuid: string; role: string }) {
    if (target.userUuid === req.user!.userUuid) throw forbid("CANNOT_MODIFY_SELF");

    const targetTenant = memberTenantRank(req.tenant!.ownerUuid, target);
    if (targetTenant > 0) {
        if (targetTenant >= callerTenantRank(req)) throw forbid("TARGET_ROLE_TOO_HIGH");
        return;
    }

    const assignments = await prisma.userStore.findMany({
        where: { tenantUuid: req.tenant!.uuid, userUuid: target.userUuid, isActive: true },
        select: { storeUuid: true, role: true },
    });
    // No store to outrank them at (customers, unassigned staff): tenant admins only
    if (assignments.length === 0 && callerTenantRank(req) < TENANT_ROLE_RANK.TENANT_ADMIN) {
        throw forbid("TARGET_ROLE_TOO_HIGH");
    }
    for (const a of assignments) {
        if ((STORE_ROLE_RANK[a.role] ?? 0) >= (await callerStoreRank(req, a.storeUuid))) {
            throw forbid("TARGET_ROLE_TOO_HIGH");
        }
    }
}
