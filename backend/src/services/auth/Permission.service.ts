import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts"

export class PermissionService {
 
    // Get all permission keys for a role (by role UUID or slug)
    static async getRolePermissions(roleIdentifier: string): Promise<string[]> {
        try {
            // roleIdentifier can be a UUID or a slug
            const role = await prisma.role.findFirst({
                where: {
                    OR: [
                        { uuid: roleIdentifier },
                        { slug: roleIdentifier },
                    ],
                    active: true,
                },
                include: {
                    permissions: {
                        include: { permission: true },
                    },
                },
            });
        
            if (!role) return [];
    
            return role.permissions
                .map((rp) => rp.permission.key || rp.permission.slug)
                .filter(Boolean) as string[];
        
        } catch (error: any) {
            logWithContext("error", "[Permission] Failed to get role permissions", {
                error: error.message,
                roleIdentifier,
            });
            return [];
        }
    }
    
    // Check if a role has a specific permission
    static async hasPermission(
        roleIdentifier: string,
        permissionKey: string
    ): Promise<boolean> {
        try {
            const perms = await this.getRolePermissions(roleIdentifier);
            return perms.includes(permissionKey);
        } catch (error: any) {
            logWithContext("error", "[Permission] Failed to check permission", {
                error: error.message,
                roleIdentifier,
                permissionKey,
            });
            return false;
        }
    }
    
    // Check if a user has a specific permission (via their roles + direct grants)
    static async userHasPermission(
        userUuid: string,
        permissionKey: string,
        storeUuid?: string
    ): Promise<boolean> {
        try {
            //Check direct user permissions
            const directPerm = await prisma.userPermission.findFirst({
                where: {
                    userUuid,
                    ...(storeUuid && { storeUuid }),
                    permission: {
                        OR: [
                            { key: permissionKey },
                            { slug: permissionKey },
                        ],
                    },
                    revoked: false,
                },
            });
            if (directPerm) return true;
        
            //Check temporary permissions
            const tempPerm = await prisma.temporaryPermission.findFirst({
                where: {
                    userUuid,
                    ...(storeUuid && { storeUuid }),
                    permissionKey,
                    revoked: false,
                    validUntil: { gt: new Date() },
                },
            });
            if (tempPerm) return true;
        
            //Check role-based permissions via UserStore
            if (storeUuid) {
                const userStore = await prisma.userStore.findFirst({
                    where: { userUuid, storeUuid, active: true },
                });
                if (userStore) {
                    return this.hasPermission(userStore.role, permissionKey);
                }
            }
        
            return false;
        } catch (error: any) {
            logWithContext("error", "[Permission] userHasPermission failed", {
                error: error.message,
                userUuid,
                permissionKey,
            });
            return false;
        }
    }
    
    // Grant a permission to a role
    static async grantPermission(input: {
        roleUuid: string;
        permissionKey: string;
        grantedBy: string;
        scope?: string;
    }) {
        const permission = await prisma.permission.findFirst({
            where: {
                OR: [
                    { key: input.permissionKey },
                    { slug: input.permissionKey },
                ],
            },
            });
    
        if (!permission) throw new Error("PERMISSION_NOT_FOUND");
    
        // Check if already granted
        const existing = await prisma.rolePermission.findFirst({
            where: {
                roleUuid: input.roleUuid,
                permissionUuid: permission.uuid,
            },
        });
    
        if (existing) throw new Error("PERMISSION_ALREADY_GRANTED");
    
        await prisma.rolePermission.create({
            data: {
                roleUuid: input.roleUuid,
                permissionUuid: permission.uuid,
                grantedBy: input.grantedBy,
                scope: (input.scope as any) || "TENANT",
            },
        });
    
        logWithContext("info", "[Permission] Permission granted", {
            roleUuid: input.roleUuid,
            permissionKey: input.permissionKey,
        });
    }
    
    // Revoke a permission from a role
    static async revokePermission(input: {
        roleUuid: string;
        permissionKey: string;
    }) {
        const permission = await prisma.permission.findFirst({
            where: {
                OR: [
                    { key: input.permissionKey },
                    { slug: input.permissionKey },
                ],
            },
        });
    
        if (!permission) throw new Error("PERMISSION_NOT_FOUND");
    
        await prisma.rolePermission.deleteMany({
            where: {
                roleUuid: input.roleUuid,
                permissionUuid: permission.uuid,
            },
        });
    
        logWithContext("info", "[Permission] Permission revoked", {
            roleUuid: input.roleUuid,
            permissionKey: input.permissionKey,
        });
    }
    
    // Grant a direct permission to a user (not via role)
    static async grantUserPermission(input: {
        userUuid: string;
        permissionKey: string;
        storeUuid?: string;
        grantedBy: string;
    }) {
        const permission = await prisma.permission.findFirst({
            where: {
                OR: [
                    { key: input.permissionKey },
                    { slug: input.permissionKey },
                ],
            },
        });
    
        if (!permission) throw new Error("PERMISSION_NOT_FOUND");
    
        await prisma.userPermission.create({
            data: {
                userUuid: input.userUuid,
                permissionUuid: permission.uuid,
                storeUuid: input.storeUuid,
                grantedBy: input.grantedBy,
            },
        });
    
        logWithContext("info", "[Permission] User permission granted", {
            userUuid: input.userUuid,
            permissionKey: input.permissionKey,
        });
    }
    
    // Grant a temporary permission
    static async grantTemporaryPermission(input: {
        userUuid: string;
        permissionKey: string;
        storeUuid?: string;
        grantedBy: string;
        validUntil: Date;
        reason: string;
    }) {
        await prisma.temporaryPermission.create({
            data: {
                userUuid: input.userUuid,
                permissionKey: input.permissionKey,
                storeUuid: input.storeUuid,
                grantedBy: input.grantedBy,
                validUntil: input.validUntil,
                reason: input.reason,
            },
        });
    
        logWithContext("info", "[Permission] Temporary permission granted", {
            userUuid: input.userUuid,
            permissionKey: input.permissionKey,
            validUntil: input.validUntil.toISOString(),
        });
    }
}
 

export const getRolePermissions = PermissionService.getRolePermissions.bind(PermissionService);
export const hasPermission = PermissionService.hasPermission.bind(PermissionService);
 