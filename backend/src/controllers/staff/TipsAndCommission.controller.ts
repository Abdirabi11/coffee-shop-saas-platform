import type { Request, Response } from "express";
import { TipsAndCommissionService } from "../../services/staff/TipsAndCommission.service.ts";
import { RoleAssignmentError } from "../../domain/auth/roleHierarchy.ts";
import { staffRecordScope } from "../../domain/auth/staffAccess.ts";

const TIP_ERRORS: Record<string, number> = {
    TIP_POOL_NOT_FOUND: 404,
    TIP_POOL_NOT_CALCULATED: 409,
};

// Tips and commission are pay: the user themselves, tenant admins, or
// payroll.read at the named store (which must be in the tenant)
function summaryError(res: Response, error: any) {
    if (error instanceof RoleAssignmentError) {
        return res.status(error.status).json({ error: error.code });
    }
    return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: error.message,
    });
}


export class TipsAndCommissionController{
    //POST /api/tips/record
    static async recordTip(req: Request, res: Response) {
        try {
            const { orderUuid, tipAmount, tipMethod } = req.body;

            if (!orderUuid || tipAmount === undefined) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "orderUuid and tipAmount are required",
                });
            }

            const order = await TipsAndCommissionService.recordTip({
                orderUuid,
                tipAmount,
                tipMethod: tipMethod || "CARD",
            });

            return res.status(200).json({
                success: true,
                order,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/tips/calculate-pool
    static async calculateTipPool(req: Request, res: Response) {
        try {
            const { storeUuid, periodStart, periodEnd, periodType } = req.body;

            if (!storeUuid || !periodStart || !periodEnd) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid, periodStart, and periodEnd are required",
                });
            }

            const tipPool = await TipsAndCommissionService.calculateTipPool({
                storeUuid,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                periodType,
            });

            return res.status(200).json({
                success: true,
                tipPool,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/tips/:tipPoolUuid/distribute
    static async distributeTips(req: Request, res: Response) {
        try {
            const { tipPoolUuid } = req.params;
            const { paymentMethod } = req.body ?? {};

            const tipPool = await TipsAndCommissionService.distributeTips({
                tenantUuid: req.tenant!.uuid,
                tipPoolUuid,
                distributedBy: req.user!.userUuid,
                paymentMethod: paymentMethod || "payroll",
            });

            return res.status(200).json({
                success: true,
                tipPool,
            });

        } catch (error: any) {
            const status = TIP_ERRORS[error.message];
            if (status) return res.status(status).json({ error: error.message });
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/commission/calculate
    static async calculateCommission(req: Request, res: Response) {
        try {
            const {
                userUuid,
                storeUuid,
                periodStart,
                periodEnd,
                periodType,
                commissionRate,
                salesTarget,
            } = req.body;

            if (!userUuid || !storeUuid || !periodStart || !periodEnd || commissionRate === undefined) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Missing required fields",
                });
            }

            const commission = await TipsAndCommissionService.calculateCommission({
                userUuid,
                storeUuid,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                periodType,
                commissionRate,
                salesTarget,
            });

            return res.status(200).json({
                success: true,
                commission,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/tips/summary/:userUuid
    static async getTipSummary(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { storeUuid, dateFrom, dateTo } = req.query;

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid is required",
                });
            }

            await staffRecordScope(req, userUuid, { permissions: ["payroll.read"], storeUuid });

            const summary = await TipsAndCommissionService.getStaffTipSummary({
                userUuid,
                storeUuid: storeUuid as string,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                ...summary,
            });

        } catch (error: any) {
            return summaryError(res, error);
        }
    }

    //GET /api/commission/summary/:userUuid
    static async getCommissionSummary(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { storeUuid, dateFrom, dateTo } = req.query;

            if (!storeUuid) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "storeUuid is required",
                });
            };

            await staffRecordScope(req, userUuid, { permissions: ["payroll.read"], storeUuid });

            const summary = await TipsAndCommissionService.getStaffCommissionSummary({
                userUuid,
                storeUuid: storeUuid as string,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                ...summary,
            });

        } catch (error: any) {
            return summaryError(res, error);
        }
    }
}