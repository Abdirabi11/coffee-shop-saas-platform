import type { Request, Response } from "express";
import { WebhookManagementService } from "../../services/webhooks/WebhookManagement.service.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { OutboundUrlError } from "../../infrastructure/http/safeOutboundRequest.ts";

// Every lookup is by { uuid, tenantUuid }: another tenant's webhook is a 404
function webhookError(res: Response, error: any) {
    if (error instanceof OutboundUrlError) {
        return res.status(400).json({ error: "INVALID_WEBHOOK_URL", message: error.message });
    }
    if (error.message === "WEBHOOK_NOT_FOUND" || error.message === "STORE_NOT_FOUND") {
        return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: error.message,
    });
}

export class WebhookManagementController {

    //POST /api/webhooks
    static async createWebhook(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { name, url, events, description, storeUuid, ipWhitelist, headers } = req.body;

            if (!url || !events || events.length === 0) {
                return res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "url and events are required",
                });
            };

            const webhook = await WebhookManagementService.createWebhook({
                tenantUuid,
                storeUuid,
                name,
                url,
                events,
                description,
                ipWhitelist,
                headers,
                createdBy: req.user!.userUuid,
            });

            return res.status(201).json({
                success: true,
                webhook,
            });
        } catch (error: any) {
            logWithContext("error", "[WebhookManagement] Failed to create webhook", {
                error: error.message,
            });

            return webhookError(res, error);
        }
    }

    //GET /api/webhooks
    static async listWebhooks(req: Request, res: Response) {
        try {
            const tenantUuid = req.tenant!.uuid;
            const { storeUuid } = req.query;

            const webhooks = await WebhookManagementService.listWebhooks(
                tenantUuid,
                typeof storeUuid === "string" ? storeUuid : undefined
            );

            return res.status(200).json({
                success: true,
                webhooks,
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }

    //GET /api/webhooks/:webhookUuid
    static async getWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const webhook = await WebhookManagementService.getWebhook(req.tenant!.uuid, webhookUuid);

            return res.status(200).json({
                success: true,
                webhook,
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }

    //PATCH /api/webhooks/:webhookUuid
    static async updateWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { url, events, description, isActive, ipWhitelist, headers } = req.body;

            const webhook = await WebhookManagementService.updateWebhook({
                tenantUuid: req.tenant!.uuid,
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
            return webhookError(res, error);
        }
    }

    //DELETE /api/webhooks/:webhookUuid
    static async deleteWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            await WebhookManagementService.deleteWebhook(req.tenant!.uuid, webhookUuid);

            return res.status(200).json({
                success: true,
                message: "Webhook deleted",
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }

    //POST /api/webhooks/:webhookUuid/test
    static async testWebhook(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const result = await WebhookManagementService.testWebhook(req.tenant!.uuid, webhookUuid);

            return res.status(200).json({
                success: true,
                result,
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }


    //POST /api/webhooks/:webhookUuid/rotate-secret
    static async rotateSecret(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;

            const webhook = await WebhookManagementService.rotateSecret(req.tenant!.uuid, webhookUuid);

            return res.status(200).json({
                success: true,
                webhook,
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }

    //GET /api/webhooks/:webhookUuid/deliveries
    static async getDeliveries(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { status, page, limit } = req.query;

            const result = await WebhookManagementService.getDeliveries({
                tenantUuid: req.tenant!.uuid,
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
            return webhookError(res, error);
        }
    }

    //GET /api/webhooks/:webhookUuid/statistics
   
    static async getStatistics(req: Request, res: Response) {
        try {
            const { webhookUuid } = req.params;
            const { days } = req.query;

            const stats = await WebhookManagementService.getStatistics(
                req.tenant!.uuid,
                webhookUuid,
                days ? parseInt(days as string) : 7
            );

            return res.status(200).json({
                success: true,
                statistics: stats,
            });

        } catch (error: any) {
            return webhookError(res, error);
        }
    }
}