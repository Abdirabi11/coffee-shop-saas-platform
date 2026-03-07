import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { WebhookReceiverService } from "../../services/webhooks/WebhookReceiver.service.ts";
import { StripeWebhookHandler } from "../../handlers/webhooks/StripeWebhook.handler.ts";

export class StripeWebhookController {
  
    //POST /webhooks/stripe
    static async handle(req: Request, res: Response) {
        try {
            const signature = req.headers["stripe-signature"] as string;

            if (!signature) {
                return res.status(400).json({
                    error: "MISSING_SIGNATURE",
                    message: "Missing stripe-signature header",
                });
            }

            // Process webhook
            const result = await WebhookReceiverService.process({
                provider: "stripe",
                signature,
                rawBody: req.body as Buffer,
                handler: StripeWebhookHandler.process,
            });

            return res.status(200).json({
                received: true,
                status: result.status,
                eventId: result.eventUuid,
            });

        } catch (error: any) {
            logWithContext("error", "[StripeWebhook] Webhook processing failed", {
                error: error.message,
            });

            // Return 200 to prevent Stripe retries on our errors
            return res.status(200).json({
                received: true,
                error: error.message,
            });
        }
    }
}