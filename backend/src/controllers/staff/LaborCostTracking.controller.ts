import type { Request, Response } from "express";
import { LaborCostTrackingService } from "../../services/staff/LaborCostTracking.service.ts";


export class LaborCostTrackingController{
    //POST /api/labor-cost/budget
    static async setLaborBudget(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const {
                storeUuid,
                targetLaborPercent,
                maxLaborPercent,
                dayTargets,
            } = req.body;

            if (!storeUuid || targetLaborPercent === undefined || maxLaborPercent === undefined) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Missing required fields",
                });
            };

            const budget = await LaborCostTrackingService.setLaborBudget({
                tenantUuid,
                storeUuid,
                targetLaborPercent,
                maxLaborPercent,
                dayTargets,
            });

            return res.status(201).json({
                success: true,
                budget,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/labor-cost/dashboard/:storeUuid
    static async getDashboard(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;

            const dashboard = await LaborCostTrackingService.getLaborDashboard({
                storeUuid,
            });

            return res.status(200).json({
                success: true,
                dashboard,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/labor-cost/trends/:storeUuid
    static async getTrends(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { dateFrom, dateTo, periodType } = req.query;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            };

            const trends = await LaborCostTrackingService.getLaborCostTrends({
                storeUuid,
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
                periodType: periodType as string,
            });

            return res.status(200).json({
                success: true,
                ...trends,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

}