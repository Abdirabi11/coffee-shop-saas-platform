import { Request, Response } from "express";
import { TimeEntryService } from "../../services/staff/TimeEntry.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class TimeEntryController {
  
    //POST /api/time/clock-in
    static async clockIn(req: Request, res: Response) {
        try {
            const { userUuid, storeUuid, deviceId, latitude, longitude, shiftUuid } = req.body;

            if (!userUuid || !storeUuid || !deviceId) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "userUuid, storeUuid, and deviceId are required",
                });
            }

            const result = await TimeEntryService.clockIn({
                userUuid,
                storeUuid,
                deviceId,
                latitude,
                longitude,
                shiftUuid,
            });

            return res.status(201).json({
                success: true,
                timeEntry: result.timeEntry,
                requiresApproval: result.requiresApproval,
                approvalReason: result.approvalReason,
                geofenceViolation: result.geofenceViolation,
                distanceFromStore: result.distanceFromStore,
            });

        } catch (error: any) {
            logWithContext("error", "[TimeEntry] Clock in failed", {
                error: error.message,
            });

            if (error.message === "ALREADY_CLOCKED_IN") {
                return res.status(409).json({
                    error: "ALREADY_CLOCKED_IN",
                    message: "Already clocked in",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/time/clock-out
    static async clockOut(req: Request, res: Response) {
        try {
            const { userUuid, storeUuid, deviceId, latitude, longitude } = req.body;

            if (!userUuid || !storeUuid || !deviceId) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "userUuid, storeUuid, and deviceId are required",
                });
            }

            const timeEntry = await TimeEntryService.clockOut({
                userUuid,
                storeUuid,
                deviceId,
                latitude,
                longitude,
            });

            return res.status(200).json({
                success: true,
                timeEntry,
            });

        } catch (error: any) {
            logWithContext("error", "[TimeEntry] Clock out failed", {
                error: error.message,
            });

            if (error.message === "NOT_CLOCKED_IN") {
                return res.status(409).json({
                error: "NOT_CLOCKED_IN",
                message: "Not currently clocked in",
                });
            }

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/time/break/start
    static async startBreak(req: Request, res: Response) {
        try {
            const { timeEntryUuid, breakType } = req.body;

            const breakEntry = await TimeEntryService.startBreak({
                timeEntryUuid,
                breakType,
            });

            return res.status(201).json({
                success: true,
                breakEntry,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/time/break/end
    static async endBreak(req: Request, res: Response) {
        try {
            const { breakEntryUuid } = req.body;

            const breakEntry = await TimeEntryService.endBreak({
                breakEntryUuid,
            });

            return res.status(200).json({
                success: true,
                breakEntry,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/time/active/:storeUuid
    static async getActiveEntries(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;

            const entries = await TimeEntryService.getActiveTimeEntries(storeUuid);

            return res.status(200).json({
                success: true,
                entries,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/time/user/:userUuid
    static async getUserTimeEntries(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { periodStart, periodEnd } = req.query;

            if (!periodStart || !periodEnd) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "periodStart and periodEnd are required",
                });
            };

            const entries = await TimeEntryService.getUserTimeEntries({
                userUuid,
                periodStart: new Date(periodStart as string),
                periodEnd: new Date(periodEnd as string),
            });

            return res.status(200).json({
                success: true,
                entries,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/time/:timeEntryUuid/approve
    static async approveTimeEntry(req: Request, res: Response) {
        try {
            const { timeEntryUuid } = req.params;

            const timeEntry = await TimeEntryService.approveTimeEntry({
                timeEntryUuid,
                approvedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                timeEntry,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}