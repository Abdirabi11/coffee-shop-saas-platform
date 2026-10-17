import type { Request, Response } from "express";
import { planLimitErrorResponse } from "../../services/billing/PlanLimit.service.ts";
import { StaffManagementService } from "../../services/staff/StaffManagement.service.ts";
import { PermissionManagementService } from "../../services/staff/PermissionManagement.service.ts";
import prisma from "../../config/prisma.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import {
    RoleAssignmentError,
    assertCanAssignStoreRole,
    assertCanAssignTenantRole,
    assertCanModifyStaffMember,
    assertCanModifyStoreMember,
    assertStoreInTenant,
    callerTenantRank,
    findTenantMember,
} from "../../domain/auth/roleHierarchy.ts";

const TENANT_ADMIN_RANK = 2;

export class StaffManagementController {
  
    //POST /api/staff
    static async createStaff(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuids,
                email,
                phoneNumber,
                firstName,
                lastName,
                pin,
                password,
                role,
                storeRoles,
                employmentType,
                payRate,
                hireDate,
                certifications,
            } = req.body;

            if (!storeUuids || storeUuids.length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "At least one store is required",
                });
            };

            if (!pin || !/^\d{4}$/.test(pin)) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "PIN must be 4 digits",
                });
            };

            // Tenant role and each store role must be below the caller's own,
            // at stores of this tenant (the service defaults a store to CASHIER)
            assertCanAssignTenantRole(req, role ?? "STAFF");
            for (const storeUuid of storeUuids) {
                await assertStoreInTenant(req, storeUuid);
                await assertCanAssignStoreRole(req, storeUuid, (storeRoles || {})[storeUuid] || "CASHIER");
            }

            const user = await StaffManagementService.createStaff({
                tenantUuid,
                storeUuids,
                email,
                phoneNumber,
                firstName,
                lastName,
                pin,
                password,
                role,
                storeRoles: storeRoles || {},
                employmentType,
                payRate,
                hireDate: hireDate ? new Date(hireDate) : undefined,
                certifications,
                createdBy: req.user!.userUuid,
            });

            return res.status(201).json({
                success: true,
                user: {
                    uuid: user.uuid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                },
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            const limited = planLimitErrorResponse(res, error);
            if (limited) return limited;
            logWithContext("error", "[StaffManagement] Create staff failed", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/staff/store/:storeUuid
    static async getStoreStaff(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { includeInactive } = req.query;

            const staff = await StaffManagementService.getStoreStaff(
                storeUuid,
                includeInactive === "true"
            );

            return res.status(200).json({
                success: true,
                staff,
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/staff/:userUuid
    static async getStaffProfile(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;

            // Target must be a member of this tenant (404 otherwise). Visible
            // to the user themselves, tenant admins, and anyone holding
            // staff.read at a store the target works at; pay only to the first two.
            await findTenantMember(req, { userUuid });
            const isSelf = userUuid === req.user!.userUuid;
            const isTenantAdmin = callerTenantRank(req) >= TENANT_ADMIN_RANK;

            if (!isSelf && !isTenantAdmin) {
                const stores = await prisma.userStore.findMany({
                    where: { tenantUuid, userUuid, isActive: true },
                    select: { storeUuid: true },
                });
                let canRead = false;
                for (const { storeUuid } of stores) {
                    if (await PermissionManagementService.hasPermission({
                        userUuid: req.user!.userUuid,
                        storeUuid,
                        permissionSlug: "staff.read",
                    })) {
                        canRead = true;
                        break;
                    }
                }
                if (!canRead) {
                    return res.status(403).json({ error: "FORBIDDEN", message: "You do not have permission: staff.read" });
                }
            }

            const profile = await StaffManagementService.getStaffProfile({
                tenantUuid,
                userUuid,
                includePay: isSelf || isTenantAdmin,
            });

            return res.status(200).json({
                success: true,
                profile,
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //PATCH /api/staff/:userUuid
    static async updateStaff(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const {
                firstName,
                lastName,
                email,
                phoneNumber,
                employmentStatus,
                certifications,
            } = req.body;

            // Phone and email are login identifiers: only for members of this
            // tenant who rank below the caller
            await assertCanModifyStaffMember(req, await findTenantMember(req, { userUuid }));

            const user = await StaffManagementService.updateStaff({
                tenantUuid: req.tenant!.uuid,
                userUuid,
                firstName,
                lastName,
                email,
                phoneNumber,
                employmentStatus,
                certifications,
            });

            return res.status(200).json({
                success: true,
                user,
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/staff/:userUuid/store-access
    static async grantStoreAccess(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid, role, isPrimary } = req.body;

            // Target must be a member here; caller must outrank both the
            // target's current role at the store and the role being granted
            await assertStoreInTenant(req, storeUuid);
            const target = await findTenantMember(req, { userUuid });
            await assertCanModifyStoreMember(req, target, storeUuid);
            await assertCanAssignStoreRole(req, storeUuid, role);

            const userStore = await StaffManagementService.grantStoreAccess({
                userUuid,
                storeUuid,
                tenantUuid,
                role,
                isPrimary,
            });

            return res.status(201).json({
                success: true,
                userStore,
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            const limited = planLimitErrorResponse(res, error);
            if (limited) return limited;
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //DELETE /api/staff/:userUuid/store-access/:storeUuid
    static async revokeStoreAccess(req: Request, res: Response) {
        try {
            const { userUuid, storeUuid } = req.params;
            // Express 5 leaves req.body undefined on a bodyless DELETE
            const { reason } = req.body ?? {};

            await assertStoreInTenant(req, storeUuid);
            await assertCanModifyStoreMember(req, await findTenantMember(req, { userUuid }), storeUuid);

            await StaffManagementService.revokeStoreAccess({
                userUuid,
                storeUuid,
                reason,
            });

            return res.status(200).json({
                success: true,
                message: "Store access revoked",
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/staff/auth/pin
    static async authenticatePin(req: Request, res: Response) {
        try {
            const { pin, storeUuid, deviceId } = req.body;

            if (!pin || !storeUuid || !deviceId) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "PIN, storeUuid, and deviceId are required",
                });
            }

            const result = await StaffManagementService.authenticateWithPIN({
                pin,
                storeUuid,
                deviceId,
            });

            return res.status(200).json({
                success: true,
                user: {
                    uuid: result.user.uuid,
                    firstName: result.user.firstName,
                    lastName: result.user.lastName,
                    role: result.role,
                },
            });

        } catch (error: any) {
            if (error.message === "INVALID_PIN") {
                return res.status(401).json({
                    error: "INVALID_PIN",
                    message: "Invalid PIN",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/staff/:userUuid/reset-pin
    static async resetPin(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { newPin } = req.body ?? {};

            // The PIN is a login: only for members of this tenant who rank
            // below the caller at every store they work at (the route's role
            // check alone was at whatever store the client named)
            await assertCanModifyStaffMember(req, await findTenantMember(req, { userUuid }));

            await StaffManagementService.resetPIN({
                userUuid,
                newPin,
                resetBy: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                message: "PIN reset successfully",
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            if (error.message === "PIN_INVALID_FORMAT") {
                return res.status(400).json({ error: "VALIDATION_ERROR", message: "PIN must be 4 digits" });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/staff/:userUuid/terminate
    static async terminateStaff(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;
            const { terminationDate, reason } = req.body;

            await assertCanModifyStaffMember(req, await findTenantMember(req, { userUuid }));

            const date = terminationDate ? new Date(terminationDate) : undefined;
            if (date && Number.isNaN(date.getTime())) {
                return res.status(400).json({ error: "INVALID_TERMINATION_DATE" });
            }

            const revoked = await StaffManagementService.terminateStaff({
                userUuid,
                tenantUuid,
                terminationDate: date,
                reason,
                terminatedBy: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                message: "Staff terminated",
                revoked,
            });

        } catch (error: any) {
            if (error instanceof RoleAssignmentError) {
                return res.status(error.status).json({ error: error.code });
            }
            if (error.message === "TERMINATION_DATE_IN_FUTURE") {
                return res.status(400).json({ error: error.message, message: "Termination takes effect now; a future date can't be scheduled" });
            }
            if (error.message === "STAFF_NOT_FOUND") {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}