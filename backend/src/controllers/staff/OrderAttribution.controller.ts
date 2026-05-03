import type { Request, Response } from "express";
import { OrderAttributionService } from "../../services/staff/OrderAttribution.service.ts";

export class OrderAttributionController {
  
    //POST /api/orders/:orderUuid/attribution
    static async attributeOrder(req: Request, res: Response) {
        try {
            const { orderUuid } = req.params;
            const { takenBy, preparedBy, servedBy } = req.body;

            const order = await OrderAttributionService.attributeOrder({
                orderUuid,
                takenBy,
                preparedBy,
                servedBy,
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

    //POST /api/orders/:orderUuid/taken-by
    static async setTakenBy(req: Request, res: Response) {
        try {
            const { orderUuid } = req.params;
            const userUuid = req.user!.uuid;

            const order = await OrderAttributionService.setTakenBy({
                orderUuid,
                userUuid,
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

    //POST /api/orders/:orderUuid/prepared-by
    static async addPreparedBy(req: Request, res: Response) {
        try {
            const { orderUuid } = req.params;
            const { userUuid } = req.body;

            if (!userUuid) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "userUuid is required",
                });
            };

            const order = await OrderAttributionService.addPreparedBy({
                orderUuid,
                userUuid,
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

    //POST /api/orders/:orderUuid/served-by
    static async setServedBy(req: Request, res: Response) {
        try {
            const { orderUuid } = req.params;
            const userUuid = req.user!.uuid;

            const order = await OrderAttributionService.setServedBy({
                orderUuid,
                userUuid,
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

    //GET /api/orders/stats/:userUuid
    static async getStaffOrderStats(req: Request, res: Response) {
        try {
            const { userUuid } = req.params;
            const { storeUuid, dateFrom, dateTo } = req.query;

            if (!storeUuid) {
                return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "storeUuid is required",
                });
            }

            const stats = await OrderAttributionService.getStaffOrderStats({
                userUuid,
                storeUuid: storeUuid as string,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                stats,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/orders/top-performers/:storeUuid
    static async getTopPerformers(req: Request, res: Response) {
        try {
            const { storeUuid } = req.params;
            const { dateFrom, dateTo, limit } = req.query;

            if (!dateFrom || !dateTo) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "dateFrom and dateTo are required",
                });
            };

            const performers = await OrderAttributionService.getTopPerformers({
                storeUuid,
                dateFrom: new Date(dateFrom as string),
                dateTo: new Date(dateTo as string),
                limit: limit ? parseInt(limit as string) : undefined,
            });

            return res.status(200).json({
                success: true,
                performers,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}