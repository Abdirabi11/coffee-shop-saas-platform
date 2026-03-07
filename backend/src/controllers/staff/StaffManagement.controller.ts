import { Request, Response } from "express";
import { StaffManagementService } from "../../services/staff/StaffManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

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
                createdBy: req.user!.uuid,
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

            const profile = await StaffManagementService.getStaffProfile(userUuid);

            return res.status(200).json({
                success: true,
                profile,
            });

        } catch (error: any) {
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

            const user = await StaffManagementService.updateStaff({
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
            const { reason } = req.body;

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
            const { newPin } = req.body;

            await StaffManagementService.resetPIN({
                userUuid,
                newPin,
                resetBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                message: "PIN reset successfully",
            });

        } catch (error: any) {
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

            await StaffManagementService.terminateStaff({
                userUuid,
                tenantUuid,
                terminationDate: terminationDate ? new Date(terminationDate) : undefined,
                reason,
                terminatedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                message: "Staff terminated",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}