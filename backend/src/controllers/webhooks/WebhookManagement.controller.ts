import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { WebhookManagementService } from "../../services/webhooks/WebhookManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class WebhookManagementController {

    //POST /api/webhooks
    static async createWebhook(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { url, events, description, storeUuid, ipWhitelist, headers } = req.body;

            if (!url || !events || events.length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "url and events are required",
                });
            };

            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid,
                storeUuid,
                url,
                events,
                description,
                ipWhitelist,
                headers,
                createdBy: req.user!.uuid,
            });

            return res.status(201).json({
                success: true,
                webhook,
            });
        } catch (error: any) {
            logWithContext("error", "[WebhookManagement] Failed to create webhook", {
                error: error.message,
            });

            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/webhooks
    static async listWebhooks(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid } = req.query;

            const where: any = { tenantUuid };
            if (storeUuid) where.storeUuid = storeUuid;

            const webhooks = await prisma.webhook.findMany({
                where,
                orderBy: { createdAt: "desc" },
            });

            return res.status(200).json({
                success: true,
                webhooks,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/webhooks/:webhookUuid
    static async getWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const webhook = await prisma.webhook.findUnique({
                where: { uuid: webhookUuid },
            });

            if (!webhook) {
                return res.status(404).json({
                    error: "WEBHOOK_NOT_FOUND",
                    message: "Webhook not found",
                });
            }

            return res.status(200).json({
                success: true,
                webhook,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //PATCH /api/webhooks/:webhookUuid
    static async updateWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { url, events, description, isActive, ipWhitelist, headers } = req.body;

            const webhook = await WebhookManagementService.updateWebhook({
                webhookUuid,
                url,
                events,
                description,
                isActive,
                ipWhitelist,
                headers,
            });

            return res.status(200).json({
                success: true,
                webhook,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //DELETE /api/webhooks/:webhookUuid
    static async deleteWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            await WebhookManagementService.deleteWebhook(webhookUuid);

            return res.status(200).json({
                success: true,
                message: "Webhook deleted",
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //POST /api/webhooks/:webhookUuid/test
    static async testWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const result = await WebhookManagementService.testWebhook(webhookUuid);

            return res.status(200).json({
                success: true,
                result,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }


    //POST /api/webhooks/:webhookUuid/rotate-secret
    static async rotateSecret(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const webhook = await WebhookManagementService.rotateSecret(webhookUuid);

            return res.status(200).json({
                success: true,
                webhook,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }

    //GET /api/webhooks/:webhookUuid/deliveries
    static async getDeliveries(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { status, page, limit } = req.query;

            const result = await WebhookManagementService.getDeliveries({
                webhookUuid,
                status: status as string,
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

    //GET /api/webhooks/:webhookUuid/statistics
   
    static async getStatistics(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { days } = req.query;

            const stats = await WebhookManagementService.getStatistics(
                webhookUuid,
                days ? parseInt(days as string) : 7
            );

            return res.status(200).json({
                success: true,
                statistics: stats,
            });

        } catch (error: any) {
            return res.status(500).json({
                error: "INTERNAL_SERVER_ERROR",
                message: error.message,
            });
        }
    }
}