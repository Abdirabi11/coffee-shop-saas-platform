import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { invalidateCache, withCache } from "../../cache/cache.ts";


export class PermissionManagementService{
    //Check if user has permission (works offline with cached data)
    static async hasPermission(input: {
        userUuid: string;
        storeUuid: string;
        permissionSlug: string;
    }): Promise<boolean> {
        try {
            // 1. Check temporary permissions first (highest priority)
            const tempPermission = await prisma.temporaryPermission.findFirst({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    permission: {
                        slug: input.permissionSlug,
                    },
                    validFrom: { lte: new Date() },
                    validUntil: { gte: new Date() },
                    revoked: false,
                },
            });

            if (tempPermission) {
                logWithContext("debug", "[Permission] Temporary permission granted", {
                    userUuid: input.userUuid,
                    permission: input.permissionSlug,
                });
                return true;
            };

            // 2. Check explicit user permissions (grants or revokes)
            const userPermission = await prisma.userPermission.findFirst({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    permission: {
                        slug: input.permissionSlug,
                    },
                },
            });

            if (userPermission) {
                return userPermission.granted;
            };

            // 3. Check role-based permissions
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            if (!userStore || !userStore.isActive) {
                return false;
            }

            // Get role permissions
            const rolePermissions = await this.getRolePermissions(userStore.role);
            const hasRolePermission = rolePermissions.some(
                (p) => p.slug === input.permissionSlug
            );

            return hasRolePermission;

        } catch (error: any) {
            logWithContext("error", "[Permission] Permission check failed", {
                error: error.message,
                userUuid: input.userUuid,
                permission: input.permissionSlug,
            });

            // Fail open for non-critical permissions
            return false;
        }
    }

    //Get all permissions for user at store (for offline caching)
    static async getUserPermissions(input: {
        userUuid: string;
        storeUuid: string;
    }) {
        const cacheKey = `permissions:user:${input.userUuid}:store:${input.storeUuid}`;

        return withCache(cacheKey, 300, async () => {
            // Get user's role at this store
            const userStore = await prisma.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });

            if (!userStore || !userStore.isActive) {
                return {
                    role: null,
                    rolePermissions: [],
                    customPermissions: [],
                    tempPermissions: [],
                    allPermissions: [],
                };
            }

            // Get role permissions
            const rolePermissions = await this.getRolePermissions(userStore.role);

            // Get custom user permissions
            const customPermissions = await prisma.userPermission.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
                include: {
                    permission: true,
                },
            });

            // Get active temporary permissions
            const tempPermissions = await prisma.temporaryPermission.findMany({
                where: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                    validFrom: { lte: new Date() },
                    validUntil: { gte: new Date() },
                    revoked: false,
                },
                include: {
                    permission: true,
                },
            });

            // Combine all permissions
            const allPermissionSlugs = new Set([
                ...rolePermissions.map((p) => p.slug),
                ...customPermissions
                .filter((cp) => cp.granted)
                .map((cp) => cp.permission.slug),
                ...tempPermissions.map((tp) => tp.permission.slug),
            ]);

            // Remove explicitly revoked permissions
            const revokedSlugs = customPermissions
                .filter((cp) => !cp.granted)
                .map((cp) => cp.permission.slug);

            revokedSlugs.forEach((slug) => allPermissionSlugs.delete(slug));

            return {
                    role: userStore.role,
                    rolePermissions: rolePermissions.map((p) => p.slug),
                    customPermissions: customPermissions.map((cp) => ({
                    slug: cp.permission.slug,
                    granted: cp.granted,
                    grantedBy: cp.grantedBy,
                    reason: cp.reason,
                })),
                    tempPermissions: tempPermissions.map((tp) => ({
                    slug: tp.permission.slug,
                    validUntil: tp.validUntil,
                    grantedBy: tp.grantedBy,
                    reason: tp.reason,
                })),
                allPermissions: Array.from(allPermissionSlugs),
            };
        });
    }

    static async grantTemporaryPermission(input: {
        userUuid: string;
        storeUuid: string;
        permissionSlug: string;
        validUntilMinutes: number; // Duration in minutes
        grantedBy: string;
        reason: string;
    }) {
        // Get permission
        const permission = await prisma.permission.findUnique({
            where: { slug: input.permissionSlug },
        });

        if (!permission) {
            throw new Error("PERMISSION_NOT_FOUND");
        }

        // Calculate expiry
        const validUntil = dayjs().add(input.validUntilMinutes, "minute").toDate();

        // Create temporary permission
        const tempPermission = await prisma.temporaryPermission.create({
            data: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                permissionUuid: permission.uuid,
                validFrom: new Date(),
                validUntil,
                grantedBy: input.grantedBy,
                reason: input.reason,
            },
        });

        logWithContext("info", "[Permission] Temporary permission granted", {
            userUuid: input.userUuid,
            permission: input.permissionSlug,
            validUntil,
            grantedBy: input.grantedBy,
        });

        // Invalidate cache
        await invalidateCache(`permissions:user:${input.userUuid}:store:${input.storeUuid}`);

        return tempPermission;
    }

    static async useTemporaryPermission(input: {
        tempPermissionUuid: string;
        usedFor: string;
    }) {
        await prisma.temporaryPermission.update({
            where: { uuid: input.tempPermissionUuid },
            data: {
                used: true,
                usedAt: new Date(),
                usedFor: input.usedFor,
            },
        });

        logWithContext("info", "[Permission] Temporary permission used", {
            tempPermissionUuid: input.tempPermissionUuid,
            usedFor: input.usedFor,
        });
    }

    static async revokeTemporaryPermission(input: {
        tempPermissionUuid: string;
        revokedBy: string;
    }) {
        const tempPermission = await prisma.temporaryPermission.update({
            where: { uuid: input.tempPermissionUuid },
            data: {
                revoked: true,
                revokedBy: input.revokedBy,
                revokedAt: new Date(),
            },
        });

        // Invalidate cache
        await invalidateCache(
            `permissions:user:${tempPermission.userUuid}:store:${tempPermission.storeUuid}`
        );

        logWithContext("info", "[Permission] Temporary permission revoked", {
            tempPermissionUuid: input.tempPermissionUuid,
            revokedBy: input.revokedBy,
        });
    }

    static async grantCustomPermission(input: {
        userUuid: string;
        storeUuid: string;
        permissionSlug: string;
        grantedBy: string;
        reason?: string;
    }) {
        const permission = await prisma.permission.findUnique({
            where: { slug: input.permissionSlug },
        });

        if (!permission) {
            throw new Error("PERMISSION_NOT_FOUND");
        };

        await prisma.userPermission.upsert({
            where: {
                userUuid_storeUuid_permissionUuid: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                permissionUuid: permission.uuid,
                },
            },
            create: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                permissionUuid: permission.uuid,
                granted: true,
                grantedBy: input.grantedBy,
                reason: input.reason,
            },
            update: {
                granted: true,
                grantedBy: input.grantedBy,
                grantedAt: new Date(),
                reason: input.reason,
            },
        });

        logWithContext("info", "[Permission] Custom permission granted", {
            userUuid: input.userUuid,
            permission: input.permissionSlug,
            grantedBy: input.grantedBy,
        });

        // Invalidate cache
        await invalidateCache(`permissions:user:${input.userUuid}:store:${input.storeUuid}`);
    }

    static async revokeCustomPermission(input: {
        userUuid: string;
        storeUuid: string;
        permissionSlug: string;
        revokedBy: string;
    }) {
        const permission = await prisma.permission.findUnique({
            where: { slug: input.permissionSlug },
        });

        if (!permission) {
            throw new Error("PERMISSION_NOT_FOUND");
        };

        await prisma.userPermission.upsert({
            where: {
                userUuid_storeUuid_permissionUuid: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                permissionUuid: permission.uuid,
                },
            },
            create: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                permissionUuid: permission.uuid,
                granted: false,
                grantedBy: input.revokedBy,
            },
            update: {
                granted: false,
                grantedBy: input.revokedBy,
                grantedAt: new Date(),
            },
        });

        // Invalidate cache
        await invalidateCache(`permissions:user:${input.userUuid}:store:${input.storeUuid}`);
    }

    private static async getRolePermissions(role: string) {
        const cacheKey = `permissions:role:${role}`;

        return withCache(cacheKey, 600, async () => {
            // Get default role permissions based on role
            const defaultPermissions = this.getDefaultRolePermissions(role);

            // Check if custom role exists
            const customRole = await prisma.role.findFirst({
                where: { slug: role.toLowerCase() },
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            });

            if (customRole) {
                return customRole.permissions.map((rp) => rp.permission);
            };

            return defaultPermissions;
        });
    }


    private static getDefaultRolePermissions(role: string) {
        const permissionsByRole: Record<string, any[]> = {
            STORE_MANAGER: [
                { slug: "order.create", name: "Create Orders" },
                { slug: "order.read", name: "View Orders" },
                { slug: "order.update", name: "Update Orders" },
                { slug: "order.cancel", name: "Cancel Orders" },
                { slug: "order.refund", name: "Refund Orders" },
                { slug: "product.read", name: "View Products" },
                { slug: "product.update", name: "Update Products" },
                { slug: "staff.read", name: "View Staff" },
                { slug: "staff.manage", name: "Manage Staff" },
                { slug: "shift.manage", name: "Manage Shifts" },
                { slug: "cash.open", name: "Open Cash Drawer" },
                { slug: "cash.close", name: "Close Cash Drawer" },
                { slug: "reports.view", name: "View Reports" },
            ],
            SHIFT_SUPERVISOR: [
                { slug: "order.create", name: "Create Orders" },
                { slug: "order.read", name: "View Orders" },
                { slug: "order.update", name: "Update Orders" },
                { slug: "order.cancel", name: "Cancel Orders" },
                { slug: "product.read", name: "View Products" },
                { slug: "staff.read", name: "View Staff" },
                { slug: "cash.open", name: "Open Cash Drawer" },
                { slug: "cash.close", name: "Close Cash Drawer" },
            ],
            CASHIER: [
                { slug: "order.create", name: "Create Orders" },
                { slug: "order.read", name: "View Orders" },
                { slug: "product.read", name: "View Products" },
            ],
            BARISTA: [
                { slug: "order.read", name: "View Orders" },
                { slug: "order.update_status", name: "Update Order Status" },
                { slug: "product.read", name: "View Products" },
            ],
            KITCHEN_STAFF: [
                { slug: "order.read", name: "View Orders" },
                { slug: "order.update_status", name: "Update Order Status" },
            ],
        };

        return permissionsByRole[role] || [];
    }

    static async getAllPermissions() {
        return withCache("permissions:all", 600, async () => {
            return prisma.permission.findMany({
                orderBy: [{ category: "asc" }, { name: "asc" }],
            });
        });
    }
}