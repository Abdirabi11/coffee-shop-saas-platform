import type { Request, Response } from "express";
import { BreakEnforcementService } from "../../services/staff/BreakEnforcement.service.ts";
import prisma from "../../config/prisma.ts";
import { resolveRoles } from "../../middlewares/auth.middleware.ts";

const BREAK_ERRORS: Record<string, number> = {
    TIME_ENTRY_NOT_FOUND: 404,
    VIOLATION_NOT_FOUND: 404,
    VIOLATION_SELF_REVIEW: 403,
    VIOLATION_ALREADY_ACKNOWLEDGED: 409,
    VIOLATION_ALREADY_WAIVED: 409,
};

function breakError(res: Response, error: any) {
    const status = BREAK_ERRORS[error.message];
    if (status) return res.status(status).json({ error: error.message });
    return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: error.message,
    });
}

// Who may check a time entry's break requirement besides its owner
const SUPERVISOR_ROLES = ["SHIFT_SUPERVISOR", "MANAGER", "STORE_MANAGER", "ADMIN", "TENANT_ADMIN", "OWNER", "SUPER_ADMIN"];

export class BreakEnforcementController {
  
    //POST /api/break-policies/standard
    static async createStandardPolicies(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid } = req.body;

            const policies = await BreakEnforcementService.createStandardPolicies({
                tenantUuid,
                storeUuid,
            });

            return res.status(201).json({
                success: true,
                policies,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/break-enforcement/check/:timeEntryUuid
    static async checkBreakRequirement(req: Request, res: Response) {
        try {
            const { timeEntryUuid } = req.params;
            const tenantUuid = req.tenant!.uuid;

            // The entry's owner, or a supervisor at the entry's own store
            const entry = await prisma.timeEntry.findFirst({
                where: { uuid: timeEntryUuid, tenantUuid },
                select: { userUuid: true, storeUuid: true },
            });
            if (!entry) throw new Error("TIME_ENTRY_NOT_FOUND");
            if (entry.userUuid !== req.user!.userUuid && req.user!.globalRole !== "SUPER_ADMIN") {
                const { roles } = await resolveRoles(req, entry.storeUuid);
                if (!SUPERVISOR_ROLES.some((r) => roles.has(r))) {
                    return res.status(403).json({ error: "INSUFFICIENT_ROLE" });
                }
            }

            const result = await BreakEnforcementService.checkBreakRequirement(tenantUuid, timeEntryUuid);

            return res.status(200).json({
                success: true,
                ...result,
            });

        } catch (error: any) {
            return breakError(res, error);
        }
    }

    //GET /api/break-enforcement/violations/:storeUuid
    static async getViolations(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { userUuid, acknowledged, dateFrom, dateTo } = req.query;

            const violations = await BreakEnforcementService.getViolations({
                storeUuid,
                userUuid: userUuid as string,
                acknowledged: acknowledged === "true" ? true : acknowledged === "false" ? false : undefined,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                violations,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/break-enforcement/violations/:violationUuid/acknowledge
    static async acknowledgeViolation(req: Request, res: Response) {
        try {
            const { violationUuid } = req.params;

            const violation = await BreakEnforcementService.acknowledgeViolation({
                tenantUuid: req.tenant!.uuid,
                violationUuid,
                acknowledgedBy: req.user!.userUuid,
            });

            return res.status(200).json({
                success: true,
                violation,
            });

        } catch (error: any) {
            return breakError(res, error);
        }
    }

    //POST /api/break-enforcement/violations/:violationUuid/waive
    static async waiveViolation(req: Request, res: Response) {
        try {
            const { violationUuid } = req.params;
            const { reason } = req.body ?? {};

            if (!reason) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "reason is required",
                });
            }

            const violation = await BreakEnforcementService.waiveViolation({
                tenantUuid: req.tenant!.uuid,
                violationUuid,
                waivedBy: req.user!.userUuid,
                reason,
            });

        return res.status(200).json({
            success: true,
            violation,
        });

        } catch (error: any) {
            return breakError(res, error);
        }
    }
}