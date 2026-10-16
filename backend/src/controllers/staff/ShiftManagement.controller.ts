import type { Request, Response } from "express";
import { ShiftManagementService } from "../../services/staff/ShiftManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { RoleAssignmentError } from "../../domain/auth/roleHierarchy.ts";
import { staffRecordScope } from "../../domain/auth/staffAccess.ts";

const SWAP_ERRORS: Record<string, number> = {
    VALIDATION_ERROR: 400,
    SWAP_REQUEST_NOT_FOUND: 404,
    SWAP_SELF_APPROVE: 403,
    SWAP_NOT_PENDING: 409,
};


export class ShiftManagementController {
  
    //POST /api/shifts
    static async createShift(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuid,
                userUuid,
                role,
                scheduledStart,
                scheduledEnd,
                shiftType,
                requiredBreaks,
                breakDuration,
                notes,
            } = req.body;

            const shift = await ShiftManagementService.createShift({
                tenantUuid,
                storeUuid,
                userUuid,
                role,
                scheduledStart: new Date(scheduledStart),
                scheduledEnd: new Date(scheduledEnd),
                shiftType,
                requiredBreaks,
                breakDuration,
                notes,
            });

            return res.status(201).json({
                success: true,
                shift,
            });

        } catch (error: any) {
            logWithContext("error", "[Shift] Create shift failed", {
                error: error.message,
            });

            if (error.message === "SHIFT_CONFLICT_EXISTS") {
                return res.status(409).json({
                    error: "SHIFT_CONFLICT",
                    message: "Staff member already has a shift at this time",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/shifts/store/:storeUuid
    static async getStoreShifts(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { date } = req.query;

            if (!date) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Date is required",
                });
            }

            const shifts = await ShiftManagementService.getStoreShifts({
                storeUuid,
                date: new Date(date as string),
            });

            return res.status(200).json({
                success: true,
                shifts,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/shifts/user/:userUuid
    static async getUserShifts(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { daysAhead, storeUuid } = req.query;

            // Tenant member; the user themselves and tenant admins see every
            // store, others only stores where they hold shift.read/manage
            const { stores } = await staffRecordScope(req, userUuid, {
                permissions: ["shift.read", "shift.manage"],
                storeUuid,
            });
            const days = daysAhead ? parseInt(daysAhead as string) : 7;

            const shifts = await ShiftManagementService.getUserShifts({
                tenantUuid: req.tenant!.uuid,
                userUuid,
                daysAhead: Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 7,
                storeUuids: stores,
            });

            return res.status(200).json({
                success: true,
                shifts,
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

    //PATCH /api/shifts/:shiftUuid
    static async updateShift(req: Request, res: Response) {
        try {
            const { shiftUuid } = req.params;
            const { scheduledStart, scheduledEnd, role, status, notes } = req.body;

            const shift = await ShiftManagementService.updateShift({
                tenantUuid: req.tenant!.uuid,
                shiftUuid,
                scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
                scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
                role,
                status,
                notes,
            });

            return res.status(200).json({
                success: true,
                shift,
            });

        } catch (error: any) {
            if (error.message === "SHIFT_NOT_FOUND") {
                return res.status(404).json({ error: "SHIFT_NOT_FOUND", message: "Shift not found" });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //DELETE /api/shifts/:shiftUuid
    static async cancelShift(req: Request, res: Response) {
        try {
            const { shiftUuid } = req.params;
            // Express 5 leaves req.body undefined on a bodyless DELETE
            const { reason } = req.body ?? {};

            const shift = await ShiftManagementService.cancelShift({
                tenantUuid: req.tenant!.uuid,
                shiftUuid,
                reason,
            });

            return res.status(200).json({
                success: true,
                shift,
            });

        } catch (error: any) {
            if (error.message === "SHIFT_NOT_FOUND") {
                return res.status(404).json({ error: "SHIFT_NOT_FOUND", message: "Shift not found" });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/shifts/:shiftUuid/swap
    static async requestSwap(req: Request, res: Response) {
        try {
            const { shiftUuid } = req.params;
            const { requestedWith, reason } = req.body;

            const swapRequest = await ShiftManagementService.requestShiftSwap({
                shiftUuid,
                requestedBy: req.user!.userUuid,
                requestedWith,
                reason,
            });

            return res.status(201).json({
                success: true,
                swapRequest,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/shifts/swap/:swapRequestUuid/respond
    static async respondToSwap(req: Request, res: Response) {
        try {
            const { swapRequestUuid } = req.params;
            const { approved, notes } = req.body ?? {};
            if (typeof approved !== "boolean") {
                throw new Error("VALIDATION_ERROR");
            }

            const swapRequest = await ShiftManagementService.respondToShiftSwap({
                tenantUuid: req.tenant!.uuid,
                swapRequestUuid,
                managerUuid: req.user!.userUuid,
                approved,
                notes,
            });

            return res.status(200).json({
                success: true,
                swapRequest,
            });

        } catch (error: any) {
            const status = SWAP_ERRORS[error.message];
            if (status) return res.status(status).json({ error: error.message });
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/shifts/coverage/:storeUuid
    static async getShiftCoverage(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { date } = req.query;

            if (!date) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Date is required",
                });
            };

            const coverage = await ShiftManagementService.getShiftCoverage({
                storeUuid,
                date: new Date(date as string),
            });

            return res.status(200).json({
                success: true,
                coverage,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}