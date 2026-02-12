import type { Request, Response } from "express"
import { WebhookDeadLetterQueue } from "../services/webhooks/WebhookDeadLetterQueue.service.ts";
import { WebhookReplayService } from "../services/webhooks/webhookReplay.service.ts";

export class WebhookAdminController {
    /**
     * POST /admin/webhooks/replay/:eventId
    */
    static async replayWebhook(req: Request, res: Response) {
        try {
            const { eventUuid } = req.params;
            const { provider } = req.body;
    
            const replay = await WebhookReplayService.replayByEventId(provider, eventUuid);
    
            return res.status(200).json({
                success: true,
                replay,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
  
    /**
     * POST /admin/webhooks/replay/range
    */
    static async replayRange(req: Request, res: Response) {
        try {
            const { provider, startDate, endDate, eventType } = req.body;
    
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
                success: false,
                message: error.message,
            });
        }
    }
  
    /**
     * GET /admin/webhooks/dlq
    */
    static async getDLQ(req: Request, res: Response) {
        try {
            const { provider, status, limit } = req.query;
    
            const dlq = await WebhookDeadLetterQueue.getAll({
                provider: provider as string,
                status: status as string,
                limit: limit ? parseInt(limit as string) : undefined,
            });
    
            return res.status(200).json({
                success: true,
                count: dlq.length,
                dlq,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
  
    /**
     * POST /admin/webhooks/dlq/:dlqUuid/retry
    */
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
                success: false,
                message: error.message,
            });
        }
    }
}