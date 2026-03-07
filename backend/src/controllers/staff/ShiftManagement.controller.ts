import { Request, Response } from "express";
import { ShiftManagementService } from "../../services/staff/ShiftManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";


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
            const { daysAhead } = req.query;

            const shifts = await ShiftManagementService.getUserShifts({
                userUuid,
                daysAhead: daysAhead ? parseInt(daysAhead as string) : 7,
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

    //PATCH /api/shifts/:shiftUuid
    static async updateShift(req: Request, res: Response) {
        try {
            const { shiftUuid } = req.params;
            const { scheduledStart, scheduledEnd, role, status, notes } = req.body;

            const shift = await ShiftManagementService.updateShift({
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
            const { reason } = req.body;

            const shift = await ShiftManagementService.cancelShift({
                shiftUuid,
                reason,
            });

            return res.status(200).json({
                success: true,
                shift,
            });

        } catch (error: any) {
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
                requestedBy: req.user!.uuid,
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
            const { approved, notes } = req.body;

            const swapRequest = await ShiftManagementService.respondToShiftSwap({
                swapRequestUuid,
                managerUuid: req.user!.uuid,
                approved,
                notes,
            });

            return res.status(200).json({
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