import { Request, Response } from "express";
import { TipsAndCommissionService } from "../../services/staff/TipsAndCommission.service.js";


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
            const { paymentMethod } = req.body;

            const tipPool = await TipsAndCommissionService.distributeTips({
                tipPoolUuid,
                distributedBy: req.user!.uuid,
                paymentMethod: paymentMethod || "payroll",
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
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
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
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}