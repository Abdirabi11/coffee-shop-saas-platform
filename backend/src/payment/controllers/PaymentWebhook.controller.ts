import { Request, Response } from "express";
import { EventBus } from "../../events/eventBus.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";
import { WebhookDedupService } from "../../services/webhook/webhookDedup.service.js";
import { verifyWebhookSignature } from "../../services/webhookSecurity.service.js";

export class PaymentWebhookController{
    static async handle(req: Request, res: Response){
        const signature= req.headers["x-provider-signature"] as string;
        const rawBody = req.body;
        const provider = "stripe"; 

        verifyWebhookSignature(provider, req.body, signature);
        const { uuid: eventUuid, type, data } = req.body;

        if (await WebhookDedupService.hasProcessed(eventUuid)) {
          return res.status(200).json({ received: true });
        }

        await WebhookDedupService.record({
          provider,
          eventUuid,
          eventType: type,
          payload: req.body,
        });

        const event= await WebhookVerifier.verify({
            signature,
            rawBody,
            provider: "stripe",
        });

        const alreadyProcessed= await PaymentService.isWebhookProcessed(
            event.uuid
        )
        if (alreadyProcessed) {
            return res.status(200).json({ received: true });
        }

        switch (event.type){
            case "payment_intent.succeeded":
              await PaymentService.confirmPaymentFromWebhook(event.data)
              break;

            case "payment_intent.payment_failed":
              await PaymentService.markPaymentFailedFromWebhook(event.data);
              break;
            
            case "charge.refunded":
              await PaymentService.syncRefundFromWebhook(event.data);
              break;
            
            default:
              EventBus.emit("PAYMENT_WEBHOOK_IGNORED", {
                type: event.type
              })
        }

        await PaymentService.markWebhookProcessed(event.id);

        return res.status(200).json({ received: true });
    };
};

static async handle(req: Request, res: Response) {
  const provider = "stripe"; // or detect dynamically
  const signature = req.headers["stripe-signature"];

  // 1️⃣ Verify signature
  verifyWebhookSignature(provider, req.body, signature);

  const { id: eventId, type, data } = req.body;

  // 2️⃣ Deduplication
  if (await WebhookDedupService.hasProcessed(eventId)) {
    return res.status(200).json({ received: true });
  }

  // 3️⃣ Record event FIRST
  await WebhookDedupService.record({
    provider,
    eventId,
    eventType: type,
    payload: req.body,
  });

  // 4️⃣ Dispatch
  switch (type) {
    case "payment_intent.succeeded":
      await PaymentService.confirmPaymentFromWebhook(data.object);
      break;

    case "payment_intent.payment_failed":
      await PaymentService.failPaymentFromWebhook(data.object);
      break;

    case "charge.refunded":
      await RefundService.processProviderRefund(data.object);
      break;
  }

  return res.json({ received: true });
}
