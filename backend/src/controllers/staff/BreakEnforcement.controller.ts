import type { Request, Response } from "express";
import { BreakEnforcementService } from "../../services/staff/BreakEnforcement.service.ts";

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

            const result = await BreakEnforcementService.checkBreakRequirement(timeEntryUuid);

            return res.status(200).json({
                success: true,
                ...result,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
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
                violationUuid,
                acknowledgedBy: req.user!.uuid,
            });

            return res.status(200).json({
                success: true,
                violation,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/break-enforcement/violations/:violationUuid/waive
    static async waiveViolation(req: Request, res: Response) {
        try {
            const { violationUuid } = req.params;
            const { reason } = req.body;

            if (!reason) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "reason is required",
                });
            }

            const violation = await BreakEnforcementService.waiveViolation({
                violationUuid,
                waivedBy: req.user!.uuid,
                reason,
            });

        return res.status(200).json({
            success: true,
            violation,
        });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}