import type { Request, Response } from "express";
import { TimeEntryService } from "../../services/staff/TimeEntry.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { findStoreInTenant } from "../../middlewares/auth.middleware.ts";
import { RoleAssignmentError } from "../../domain/auth/roleHierarchy.ts";
import { staffRecordScope } from "../../domain/auth/staffAccess.ts";
import prisma from "../../config/prisma.ts";

// Employees clock and break only themselves: the user is always the
// authenticated caller. A body userUuid naming someone else is rejected
// (it used to clock that person in or out), and the store must belong to
// the verified tenant.
async function selfClockContext(req: Request, res: Response): Promise<string | null> {
    const { userUuid, storeUuid, deviceId } = req.body ?? {};
    const caller = req.user!.userUuid;

    if (userUuid !== undefined && userUuid !== caller) {
        res.status(403).json({ error: "CANNOT_CLOCK_OTHERS", message: "You can only clock yourself in or out" });
        return null;
    }
    if (!storeUuid || !deviceId) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "storeUuid and deviceId are required" });
        return null;
    }
    if (typeof storeUuid !== "string" || !(await findStoreInTenant(req, storeUuid))) {
        res.status(404).json({ error: "STORE_NOT_FOUND", message: "Store not found" });
        return null;
    }
    return caller;
}

export class TimeEntryController {
  
    //POST /api/time/clock-in
    static async clockIn(req: Request, res: Response) {
        try {
            const userUuid = await selfClockContext(req, res);
            if (!userUuid) return;
            const { storeUuid, deviceId, latitude, longitude, shiftUuid } = req.body;

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
            const userUuid = await selfClockContext(req, res);
            if (!userUuid) return;
            const { storeUuid, deviceId, latitude, longitude } = req.body;

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
            const { timeEntryUuid, breakType } = req.body ?? {};

            // Only on the caller's own time entry
            const breakEntry = await TimeEntryService.startBreak({
                timeEntryUuid,
                breakType,
                userUuid: req.user!.userUuid,
            });

            return res.status(201).json({
                success: true,
                breakEntry,
            });

        } catch (error: any) {
            if (error.message === "TIME_ENTRY_NOT_FOUND") {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/time/break/end
    static async endBreak(req: Request, res: Response) {
        try {
            const { breakEntryUuid } = req.body ?? {};

            // Only the caller's own break
            const breakEntry = await TimeEntryService.endBreak({
                breakEntryUuid,
                userUuid: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                breakEntry,
            });

        } catch (error: any) {
            if (error.message === "BREAK_NOT_FOUND") {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/time/active/:storeUuid
    static async getActiveTimeEntries(req: Request, res: Response) {
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
            const { periodStart, periodEnd, storeUuid } = req.query;
            const tenantUuid = req.tenant!.uuid;

            const from = new Date(periodStart as string);
            const to = new Date(periodEnd as string);
            if (!periodStart || !periodEnd || isNaN(from.getTime()) || isNaN(to.getTime())) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "periodStart and periodEnd are required dates",
                });
            };

            // Tenant member; the user themselves and tenant admins see every
            // store and the pay, others only stores where they hold
            // time_entry.read or payroll.read (also stores the user has
            // entries at), never the pay
            const { stores, sensitive } = await staffRecordScope(req, userUuid, {
                permissions: ["time_entry.read", "payroll.read"],
                storeUuid,
                extraStores: async () => (await prisma.timeEntry.findMany({
                    where: { tenantUuid, userUuid }, distinct: ["storeUuid"], select: { storeUuid: true },
                })).map((e) => e.storeUuid),
            });

            const entries = await TimeEntryService.getUserTimeEntries({
                tenantUuid,
                userUuid,
                periodStart: from,
                periodEnd: to,
                storeUuids: stores,
                includePay: sensitive,
            });

            return res.status(200).json({
                success: true,
                entries,
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

    //POST /api/time/:timeEntryUuid/approve
    static async approveTimeEntry(req: Request, res: Response) {
        try {
            const { timeEntryUuid } = req.params;

            const timeEntry = await TimeEntryService.approveTimeEntry({
                tenantUuid: req.tenant!.uuid,
                timeEntryUuid,
                approvedBy: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                timeEntry,
            });

        } catch (error: any) {
            if (error.message === "TIME_ENTRY_NOT_FOUND") {
                return res.status(404).json({ error: "TIME_ENTRY_NOT_FOUND", message: "Time entry not found" });
            }
            if (error.message === "TIME_ENTRY_SELF_APPROVE") {
                return res.status(403).json({ error: "TIME_ENTRY_SELF_APPROVE", message: "You cannot approve your own time entry" });
            }
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}