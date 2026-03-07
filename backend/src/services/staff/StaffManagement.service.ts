import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { invalidateCache, withCache } from "../../cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class StaffManagementService {
  
    ///Create staff member with multi-tenant setup
    static async createStaff(input: {
        tenantUuid: string;
        storeUuids: string[]; // Stores they can access
        email?: string;
        phoneNumber?: string;
        firstName: string;
        lastName: string;
        pin: string; // 4-digit PIN
        password?: string;
        role: string; // TenantRole
        storeRoles: Record<string, string>; // { storeUuid: StoreRole }
        employmentType?: string;
        payRate?: number;
        hireDate?: Date;
        certifications?: any;
        createdBy: string;
    }) {
        try {
            // Validate PIN (must be 4 digits)
            if (!/^\d{4}$/.test(input.pin)) {
                throw new Error("PIN_INVALID_FORMAT");
            };

            // Hash PIN
            const pinHash = await bcrypt.hash(input.pin, 10);

            // Hash password if provided
            let passwordHash: string | undefined;
            if (input.password) {
                passwordHash = await bcrypt.hash(input.password, 10);
            }

            // Create user
            const user = await prisma.user.create({
                data: {
                    email: input.email,
                    phoneNumber: input.phoneNumber,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    pinHash,
                    passwordHash,
                    employmentStatus: "ACTIVE",
                    hireDate: input.hireDate || new Date(),
                    certifications: input.certifications,
                },
            });

            // Create tenant relationship
            await prisma.tenantUser.create({
                data: {
                    tenantUuid: input.tenantUuid,
                    userUuid: user.uuid,
                    role: input.role as any,
                    employmentType: (input.employmentType as any) || "PART_TIME",
                    payRate: input.payRate,
                    startDate: new Date(),
                    isActive: true,
                },
            });

            // Create store assignments
            for (const storeUuid of input.storeUuids) {
                const isPrimary = storeUuid === input.storeUuids[0]; // First is primary
                const storeRole = input.storeRoles[storeUuid] || "CASHIER";

                await prisma.userStore.create({
                    data: {
                        userUuid: user.uuid,
                        storeUuid,
                        tenantUuid: input.tenantUuid,
                        role: storeRole as any,
                        isPrimary,
                        isActive: true,
                        startDate: new Date(),
                    },
                });
            };

            logWithContext("info", "[StaffManagement] Staff created", {
                userUuid: user.uuid,
                tenantUuid: input.tenantUuid,
                storeCount: input.storeUuids.length,
            });

            MetricsService.increment("staff.created", 1, {
                tenantUuid: input.tenantUuid,
            });

            // Invalidate cache
            await invalidateCache(`staff:tenant:${input.tenantUuid}`);
            for (const storeUuid of input.storeUuids) {
                await invalidateCache(`staff:store:${storeUuid}`);
            }

            return user;

        } catch (error: any) {
            logWithContext("error", "[StaffManagement] Failed to create staff", {
                error: error.message,
            });
            throw error;
        }
    }

    static async updateStaff(input: {
        userUuid: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phoneNumber?: string;
        employmentStatus?: string;
        certifications?: any;
    }) {
        const user = await prisma.user.update({
            where: { uuid: input.userUuid },
            data: {
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                phoneNumber: input.phoneNumber,
                employmentStatus: input.employmentStatus as any,
                certifications: input.certifications,
            },
        });

        // Invalidate cache
        await invalidateCache(`staff:user:${input.userUuid}`);

        return user;
    }

    //Grant store access to staff member
    static async grantStoreAccess(input: {
        userUuid: string;
        storeUuid: string;
        tenantUuid: string;
        role: string;
        isPrimary?: boolean;
    }) {
        // Check if already exists
        const existing = await prisma.userStore.findUnique({
            where: {
                userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
            },
        });

        if (existing) {
            // Reactivate if inactive
            if (!existing.isActive) {
                return prisma.userStore.update({
                    where: { uuid: existing.uuid },
                    data: { isActive: true, role: input.role as any },
                });
            }
            throw new Error("STORE_ACCESS_ALREADY_EXISTS");
        };

        const userStore = await prisma.userStore.create({
            data: {
                userUuid: input.userUuid,
                storeUuid: input.storeUuid,
                tenantUuid: input.tenantUuid,
                role: input.role as any,
                isPrimary: input.isPrimary || false,
                isActive: true,
                startDate: new Date(),
            },
        });

        logWithContext("info", "[StaffManagement] Store access granted", {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            role: input.role,
        });

        // Invalidate cache
        await invalidateCache(`staff:store:${input.storeUuid}`);
        await invalidateCache(`staff:user:${input.userUuid}:stores`);

        return userStore;
    }

    static async revokeStoreAccess(input: {
        userUuid: string;
        storeUuid: string;
        reason?: string;
    }) {
        const userStore = await prisma.userStore.findUnique({
            where: {
                    userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
            },
        });

        if (!userStore) {
            throw new Error("STORE_ACCESS_NOT_FOUND");
        };

        await prisma.userStore.update({
            where: { uuid: userStore.uuid },
            data: {
                isActive: false,
                endDate: new Date(),
            },
        });

        logWithContext("info", "[StaffManagement] Store access revoked", {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            reason: input.reason,
        });

        // Invalidate cache
        await invalidateCache(`staff:store:${input.storeUuid}`);
        await invalidateCache(`staff:user:${input.userUuid}:stores`);
    }

    //pdate role at specific store
    static async updateStoreRole(input: {
        userUuid: string;
        storeUuid: string;
        newRole: string;
    }) {
        const userStore = await prisma.userStore.update({
            where: {
                    userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.storeUuid,
                },
            },
            data: {
                role: input.newRole as any,
            },
        });

        logWithContext("info", "[StaffManagement] Store role updated", {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
            newRole: input.newRole,
        });

        // Invalidate cache
        await invalidateCache(`staff:user:${input.userUuid}:permissions`);

        return userStore;
    }

    static async transferStaff(input: {
        userUuid: string;
        fromStoreUuid: string;
        toStoreUuid: string;
        tenantUuid: string;
        reason: string;
        newRole?: string;
    }) {
        // Remove primary from old store
        await prisma.userStore.update({
            where: {
                userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.fromStoreUuid,
                },
            },
            data: { isPrimary: false },
        });

        // Check if already has access to new store
        const existingAccess = await prisma.userStore.findUnique({
            where: {
                userUuid_storeUuid: {
                    userUuid: input.userUuid,
                    storeUuid: input.toStoreUuid,
                },
            },
        });

        if (existingAccess) {
            // Update to primary
            await prisma.userStore.update({
                where: { uuid: existingAccess.uuid },
                data: {
                    isPrimary: true,
                    role: (input.newRole as any) || existingAccess.role,
                    transferredFrom: input.fromStoreUuid,
                    transferDate: new Date(),
                    transferReason: input.reason,
                },
            });
        } else {
            // Create new access
            await prisma.userStore.create({
                data: {
                    userUuid: input.userUuid,
                    storeUuid: input.toStoreUuid,
                    tenantUuid: input.tenantUuid,
                    role: (input.newRole as any) || "CASHIER",
                    isPrimary: true,
                    isActive: true,
                    startDate: new Date(),
                    transferredFrom: input.fromStoreUuid,
                    transferDate: new Date(),
                    transferReason: input.reason,
                },
            });
        }

        logWithContext("info", "[StaffManagement] Staff transferred", {
            userUuid: input.userUuid,
            from: input.fromStoreUuid,
            to: input.toStoreUuid,
            reason: input.reason,
        });

        // Invalidate cache
        await invalidateCache(`staff:store:${input.fromStoreUuid}`);
        await invalidateCache(`staff:store:${input.toStoreUuid}`);
    }

    //Get staff by store (for offline caching)
    static async getStoreStaff(storeUuid: string, includeInactive = false) {
        const cacheKey = `staff:store:${storeUuid}:${includeInactive}`;

        return withCache(cacheKey, 300, async () => {
            const userStores = await prisma.userStore.findMany({
                where: {
                    storeUuid,
                    ...(includeInactive ? {} : { isActive: true }),
                },
                include: {
                    user: {
                        select: {
                            uuid: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phoneNumber: true,
                            profilePhoto: true,
                            employmentStatus: true,
                        },
                    },
                },
                orderBy: [
                    { isPrimary: "desc" },
                    { user: { firstName: "asc" } },
                ],
            });

            return userStores.map((us) => ({
                userUuid: us.userUuid,
                firstName: us.user.firstName,
                lastName: us.user.lastName,
                email: us.user.email,
                phoneNumber: us.user.phoneNumber,
                profilePhoto: us.user.profilePhoto,
                role: us.role,
                isPrimary: us.isPrimary,
                employmentStatus: us.user.employmentStatus,
                canAccessPOS: us.canAccessPOS,
            }));
        });
    }

    static async getStaffProfile(userUuid: string) {
        const cacheKey = `staff:user:${userUuid}`;

        return withCache(cacheKey, 300, async () => {
            const user = await prisma.user.findUnique({
                where: { uuid: userUuid },
                include: {
                    tenantUsers: {
                        where: { isActive: true },
                        include: {
                            tenant: {
                                select: {
                                    uuid: true,
                                    name: true,
                                },
                            },
                        },
                    },
                    userStores: {
                        where: { isActive: true },
                        include: {
                            store: {
                                select: {
                                    uuid: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!user) {
                throw new Error("STAFF_NOT_FOUND");
            }

            return user;
        });
    }

    static async authenticateWithPIN(input: {
        pin: string;
        storeUuid: string;
        deviceId: string;
    }) {
        try {
            // Get all staff at this store
            const userStores = await prisma.userStore.findMany({
                where: {
                    storeUuid: input.storeUuid,
                    isActive: true,
                },
                include: {
                    user: true,
                },
            });

            // Find matching PIN
            for (const us of userStores) {
                if (us.user.pinHash) {
                    const isValid = await bcrypt.compare(input.pin, us.user.pinHash);
                    if (isValid) {
                        // Update last login
                        await prisma.user.update({
                            where: { uuid: us.userUuid },
                            data: {
                                lastDeviceId: input.deviceId,
                                lastLoginAt: new Date(),
                            },
                        });

                        logWithContext("info", "[StaffManagement] PIN authentication successful", {
                            userUuid: us.userUuid,
                            storeUuid: input.storeUuid,
                        });

                        MetricsService.increment("staff.auth.pin.success", 1);

                        return {
                            user: us.user,
                            role: us.role,
                            storeAccess: us,
                        };
                    }
                }
            }

            logWithContext("warn", "[StaffManagement] PIN authentication failed", {
                storeUuid: input.storeUuid,
                deviceId: input.deviceId,
            });

            MetricsService.increment("staff.auth.pin.failed", 1);

            throw new Error("INVALID_PIN");

        } catch (error: any) {
            if (error.message === "INVALID_PIN") {
                throw error;
            }

            logWithContext("error", "[StaffManagement] PIN authentication error", {
                error: error.message,
            });
            throw error;
        }
    }

    static async resetPIN(input: {
        userUuid: string;
        newPin: string;
        resetBy: string; // Manager UUID
    }) {
        if (!/^\d{4}$/.test(input.newPin)) {
            throw new Error("PIN_INVALID_FORMAT");
        }

        const pinHash = await bcrypt.hash(input.newPin, 10);

        await prisma.user.update({
            where: { uuid: input.userUuid },
            data: { pinHash },
        });

        logWithContext("info", "[StaffManagement] PIN reset", {
            userUuid: input.userUuid,
            resetBy: input.resetBy,
        });

        MetricsService.increment("staff.pin.reset", 1);
    }

    static async terminateStaff(input: {
        userUuid: string;
        tenantUuid: string;
        terminationDate?: Date;
        reason?: string;
        terminatedBy: string;
    }) {
    // Update user
        await prisma.user.update({
            where: { uuid: input.userUuid },
            data: {
                employmentStatus: "TERMINATED",
                terminationDate: input.terminationDate || new Date(),
            },
        });

        // Deactivate tenant relationship
        await prisma.tenantUser.updateMany({
            where: {
                tenantUuid: input.tenantUuid,
                userUuid: input.userUuid,
            },
            data: {
                isActive: false,
                endDate: new Date(),
            },
        });

        // Deactivate all store access
        await prisma.userStore.updateMany({
            where: {
                tenantUuid: input.tenantUuid,
                userUuid: input.userUuid,
            },
            data: {
                isActive: false,
                endDate: new Date(),
            },
        });

        // Cancel future shifts
        await prisma.shift.updateMany({
            where: {
                userUuid: input.userUuid,
                scheduledStart: { gte: new Date() },
                status: "SCHEDULED",
            },
            data: {
                status: "CANCELLED",
            },
        });

        logWithContext("info", "[StaffManagement] Staff terminated", {
            userUuid: input.userUuid,
            reason: input.reason,
            terminatedBy: input.terminatedBy,
        });

        MetricsService.increment("staff.terminated", 1);

        // Invalidate all caches
        await invalidateCache(`staff:user:${input.userUuid}`);
        await invalidateCache(`staff:tenant:${input.tenantUuid}`);
    }

}