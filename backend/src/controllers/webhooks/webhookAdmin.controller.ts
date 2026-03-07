import type { Request, Response } from "express"
import prisma from "../../config/prisma.ts"
import { WebhookDeadLetterQueue } from "../../services/webhooks/WebhookDeadLetterQueue.service.js";
import { WebhookReplayService } from "../../services/webhooks/webhookReplay.service.js";

export class WebhookAdminController {

    //GET /api/admin/webhooks/dlq
    static async getDLQ(req: Request, res: Response) {
        try {
            const { provider, status, eventType, dateFrom, dateTo, page, limit } = req.query;

            const result = await WebhookDeadLetterQueue.getAll({
                provider: provider as string,
                status: status as string,
                eventType: eventType as string,
                dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                dateTo: dateTo ? new Date(dateTo as string) : undefined,
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
            });

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

    //POST /api/admin/webhooks/dlq/:dlqUuid/retry
    static async retryDLQ(req: Request, res: Response) {
        try {
            const { dlqUuid } = req.params;

            await WebhookDeadLetterQueue.retry(dlqUuid);

            return res.status(200).json({
                success: true,
                message: "Webhook retried successfully",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/admin/webhooks/dlq/retry-bulk
    static async retryBulk(req: Request, res: Response) {
        try {
            const { provider, eventType, limit } = req.body;

            const results = await WebhookDeadLetterQueue.retryBulk({
                provider,
                eventType,
                limit,
            });

            return res.status(200).json({
                success: true,
                results,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/admin/webhooks/dlq/:dlqUuid/abandon
    static async abandonDLQ(req: Request, res: Response) {
        try {
            const { dlqUuid } = req.params;
            const { reason } = req.body;

            await WebhookDeadLetterQueue.abandon(dlqUuid, reason);

            return res.status(200).json({
                success: true,
                message: "Webhook abandoned",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/admin/webhooks/replay/:eventUuid
    static async replayWebhook(req: Request, res: Response) {
        try {
            const { eventUuid } = req.params;
            const { provider } = req.body;

            if (!provider) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "provider is required",
                });
            }

            const replay = await WebhookReplayService.replayByEventId(provider, eventUuid);

            return res.status(200).json({
                success: true,
                replay,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/admin/webhooks/replay/range
    static async replayRange(req: Request, res: Response) {
        try {
            const { provider, startDate, endDate, eventType } = req.body;

            if (!provider || !startDate || !endDate) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "provider, startDate, and endDate are required",
                });
            }

            const results = await WebhookReplayService.replayByTimeRange({
                provider,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                eventType,
            });

            return res.status(200).json({
                success: true,
                results,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
    
    //GET /api/admin/webhooks/statistics
    static async getStatistics(req: Request, res: Response) {
        try {
            const { days } = req.query;
            const daysNum = days ? parseInt(days as string) : 7;
            const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

            const [
                totalDeliveries,
                successfulDeliveries,
                failedDeliveries,
                pendingDeliveries,
                dlqCount,
                outboxPending,
            ] = await Promise.all([
                prisma.webhookDelivery.count({
                    where: { createdAt: { gte: since } },
                }),
                prisma.webhookDelivery.count({
                    where: {
                        status: "SUCCESS",
                        createdAt: { gte: since },
                    },
                }),
                prisma.webhookDelivery.count({
                    where: {
                        status: "FAILED",
                        createdAt: { gte: since },
                    },
                }),
                prisma.webhookDelivery.count({
                    where: { status: { in: ["PENDING", "SENDING"] } },
                }),
                prisma.webhookDeadLetter.count({
                    where: { status: "FAILED" },
                }),
                prisma.webhookOutbox.count({
                    where: { status: "PENDING" },
                }),
            ]);

            const successRate = totalDeliveries > 0
                ? (successfulDeliveries / totalDeliveries) * 100
                : 0;

            return res.status(200).json({
                success: true,
                statistics: {
                    totalDeliveries,
                    successfulDeliveries,
                    failedDeliveries,
                    pendingDeliveries,
                    successRate: Number(successRate.toFixed(2)),
                    dlqCount,
                    outboxPending,
                },
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}