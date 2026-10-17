import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { invalidateCache, withCache } from "../../infrastructure/cache/cache.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { PlanLimitService } from "../billing/PlanLimit.service.ts";
import { AccessRevocationService } from "./AccessRevocation.service.ts";

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

            // One transaction: the plan's staff limit (checked under the plan
            // lock, so concurrent creates can't both take the last slot) and
            // every row, so a failure can't leave a user with half a membership
            const user = await prisma.$transaction(async (tx) => {
                if (input.storeUuids.length > 0) {
                    await PlanLimitService.assertCanAdd(tx, input.tenantUuid, "maxStaff");
                }

                // Create user
                const user = await tx.user.create({
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
                await tx.tenantUser.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        userUuid: user.uuid,
                        // Required and unique; it was missing, so every create failed
                        slug: `${input.firstName}-${input.lastName}`
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/(^-|-$)/g, "") + `-${crypto.randomBytes(3).toString("hex")}`,
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

                    await tx.userStore.create({
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

                return user;
            });

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
        tenantUuid: string;
        userUuid: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phoneNumber?: string;
        employmentStatus?: string;
        certifications?: any;
    }) {
        // Phone and email are login identifiers: never edit a user outside
        // the caller's tenant (the controller also enforces rank)
        const member = await prisma.tenantUser.findFirst({
            where: { tenantUuid: input.tenantUuid, userUuid: input.userUuid },
            select: { uuid: true },
        });
        if (!member) throw new Error("STAFF_NOT_FOUND");

        const user = await prisma.user.update({
            where: { uuid: input.userUuid },
            select: {
                uuid: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                employmentStatus: true,
                certifications: true,
                updatedAt: true,
            },
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
        const userStore = await prisma.$transaction(async (tx) => {
            // Check if already exists
            const existing = await tx.userStore.findUnique({
                where: {
                    userUuid_storeUuid: {
                        userUuid: input.userUuid,
                        storeUuid: input.storeUuid,
                    },
                },
            });
            if (existing?.isActive) {
                throw new Error("STORE_ACCESS_ALREADY_EXISTS");
            }

            // Someone with no active store in this tenant becomes staff here,
            // so they count against the plan's staff limit
            const alreadyStaff = await tx.userStore.findFirst({
                where: { userUuid: input.userUuid, tenantUuid: input.tenantUuid, isActive: true },
                select: { uuid: true },
            });
            if (!alreadyStaff) {
                await PlanLimitService.assertCanAdd(tx, input.tenantUuid, "maxStaff");
            }

            // Reactivate if inactive
            if (existing) {
                return tx.userStore.update({
                    where: { uuid: existing.uuid },
                    data: { isActive: true, role: input.role as any },
                });
            }

            return tx.userStore.create({
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

    // Profile of a member of this tenant, with safe fields only: no password
    // or PIN hashes, OTP/reset/verification tokens, token version, ban or
    // login-tracking data. Memberships and store assignments are limited to
    // this tenant, and payRate is included only when includePay is set.
    // Not cached: the old cache held the full User row in Redis.
    static async getStaffProfile(input: { tenantUuid: string; userUuid: string; includePay: boolean }) {
        const user = await prisma.user.findFirst({
            where: {
                uuid: input.userUuid,
                tenantUsers: { some: { tenantUuid: input.tenantUuid } },
            },
            select: {
                uuid: true,
                firstName: true,
                lastName: true,
                name: true,
                email: true,
                phoneNumber: true,
                profilePhoto: true,
                employmentStatus: true,
                hireDate: true,
                terminationDate: true,
                certifications: true,
                preferredLanguage: true,
                timezone: true,
                createdAt: true,
                tenantUsers: {
                    where: { tenantUuid: input.tenantUuid, isActive: true },
                    select: {
                        uuid: true,
                        role: true,
                        employmentType: true,
                        startDate: true,
                        payRate: input.includePay,
                    },
                },
                userStores: {
                    where: { tenantUuid: input.tenantUuid, isActive: true },
                    select: {
                        role: true,
                        isPrimary: true,
                        store: { select: { uuid: true, name: true } },
                    },
                },
            },
        });

        if (!user) {
            throw new Error("STAFF_NOT_FOUND");
        }

        return user;
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
                    // Only current members of the business: someone removed
                    // before removal also ended store assignments can still
                    // have an active one (tenantUserUuid isn't always set on
                    // assignments, so look the membership up directly)
                    const member = isValid && await prisma.tenantUser.findFirst({
                        where: { tenantUuid: us.tenantUuid, userUuid: us.userUuid, isActive: true },
                        select: { uuid: true },
                    });
                    if (isValid && member) {
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

    // Ends someone's employment at this tenant. Access goes through the
    // shared revocation (memberships, store access, open time entry and
    // drawer, shifts, tokens, sockets). The global User row is left alone:
    // they may work for another tenant. No scheduler applies a future date,
    // and access ends now, so the date can only be today or earlier.
    static async terminateStaff(input: {
        userUuid: string;
        tenantUuid: string;
        terminationDate?: Date;
        reason?: string;
        terminatedBy: string;
    }) {
        if (input.terminationDate && input.terminationDate.getTime() > Date.now()) {
            throw new Error("TERMINATION_DATE_IN_FUTURE");
        }

        const result = await AccessRevocationService.revokeTenantAccess({
            tenantUuid: input.tenantUuid,
            userUuid: input.userUuid,
            revokedBy: input.terminatedBy,
            reason: input.reason ? `Terminated: ${input.reason}` : "Terminated",
            endDate: input.terminationDate,
        });

        logWithContext("info", "[StaffManagement] Staff terminated", {
            userUuid: input.userUuid,
            reason: input.reason,
            terminatedBy: input.terminatedBy,
        });

        MetricsService.increment("staff.terminated", 1);

        return result;
    }

}