import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts"

export class PermissionService{
    //Get role permissions
    static async getRolePermissions(role: string): Promise<string[]> {
        try {
            const permissions = await prisma.rolePermission.findMany({
                where: { role: role as any },
                include: { permission: true },
            });

            return permissions.map((p) => p.permission.key);

        } catch (error: any) {
            logWithContext("error", "[Permission] Failed to get role permissions", {
                error: error.message,
                role,
            });

            return [];
        }
    }

    //Check if role has permission
    static async hasPermission(
        role: string,
        permissionKey: string
    ): Promise<boolean> {
        try {
            const perms = await this.getRolePermissions(role);
            return perms.includes(permissionKey);

        } catch (error: any) {
            logWithContext("error", "[Permission] Failed to check permission", {
                error: error.message,
                role,
                permissionKey,
            });

            return false;
        }
    }

    //Grant permission to role
    static async grantPermission(input: {
        role: string;
        permissionKey: string;
        grantedBy: string;
    }) {
        const permission = await prisma.permission.findUnique({
            where: { key: input.permissionKey },
        });

        if (!permission) {
            throw new Error("PERMISSION_NOT_FOUND");
        }

        await prisma.rolePermission.create({
            data: {
                role: input.role as any,
                permissionId: permission.uuid,
                grantedBy: input.grantedBy,
            },
        });

        logWithContext("info", "[Permission] Permission granted", {
            role: input.role,
            permissionKey: input.permissionKey,
        });
    }

    //Revoke permission from role
    static async revokePermission(input: {
        role: string;
        permissionKey: string;
    }){
        const permission = await prisma.permission.findUnique({
            where: { key: input.permissionKey },
        });

        if (!permission) {
            throw new Error("PERMISSION_NOT_FOUND");
        }

        await prisma.rolePermission.deleteMany({
            where: {
                role: input.role as any,
                permissionId: permission.uuid,
            },
        });

        logWithContext("info", "[Permission] Permission revoked", {
            role: input.role,
            permissionKey: input.permissionKey,
        });
    }
}

export const getRolePermissions = PermissionService.getRolePermissions;
export const hasPermission = PermissionService.hasPermission;