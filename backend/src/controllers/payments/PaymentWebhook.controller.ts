import { Request, Response } from "express";
import { EventBus } from "../../events/eventBus.ts";
import prisma from "../../config/prisma.ts"
import { PaymentService } from "../../services/payment/payment.service.ts";
import { WebhookVerifier } from "../../webhooks/webhookVerifier.ts";
import { PaymentIntentService } from "../../services/payment/payment-intent.service.ts";
import { RefundService } from "../../services/payment/refund.service.ts";
import { WebhookIdempotencyService } from "../../infrastructure/webhooks/webhookIdempotency.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.js";

const ALLOWED_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.failed",
  "charge.refunded",
];

function validateEventShape(event: any) {
  if (!event?.type || !event?.data?.object) {
    throw new Error("INVALID_WEBHOOK_PAYLOAD");
  }
}

async function assertKnownProviderRef(
  provider: string,
  providerRef: string
) {
  const payment = await prisma.payment.findFirst({
    where: { provider, providerRef },
  });

  if (!payment) {
    throw new Error("UNKNOWN_PROVIDER_REFERENCE");
  }

  return payment;
};

function assertAmountMatch(
  payment: any,
  event: any
) {
  if (
    event.amount !== payment.amount ||
    event.currency !== payment.currency
  ) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }
};

export class PaymentWebhookController{
  static async handle(req: Request, res: Response){
    const provider = "stripe";
    const signature= req.headers["x-provider-signature"] as string;
    const rawBody = req.body;

    const event= await WebhookVerifier.verify({
      provider,
      signature,
      rawBody,
    });

    const exists= await prisma.webhookEvent.findUnique({
      where: { eventUuid: event.uuid}
    });

    if (exists) {
      return res.status(200).json({ received: true });
    };

    if (
      await WebhookIdempotencyService.isWebhookProcessed(
        provider,
        event.id
      )
    ) {
      return res.sendStatus(200);
    }

    logWithContext("info", "Webhook received", {
      traceId: req.traceUuid,
      webhookEventId: event.uuid,
      provider: "stripe",
      eventType: event.type,
    });

    //If rejected:
    logWithContext("warn", "Webhook rejected", {
      traceId: req.traceUuid,
      webhookEventUuid: event.uuid,
      reason: "UNKNOWN_EVENT_TYPE",
    });

    await prisma.webhookEvent.create({
      data: {
        eventUuid: event.uuid,
        provider,
        type: event.type,
        payload: event,
      },
    });

    //feed provider fraud signals
    await RiskPolicyEnforcer.apply()

    switch (event.type){
      case "payment_intent.succeeded": {
        const data = event.data.object;
        
        await PaymentService.confirmPayment({
          orderUuid: data.metadata.orderUuid,
          provider: "stripe",
          providerRef: data.id,
          snapshot: data,
        })
        break;
      }

      case "payment_intent.payment_failed":{
        const data=  event.data.object;
        await PaymentIntentService.fail(
          data.metadata.orderUuid
        );
        break;
      }
      
      case "charge.refunded":{
        const data= event.data.object
        await RefundService.processProviderRefund(
          event.data.object
        );
        break;
      }
      
      default:
        EventBus.emit("PAYMENT_WEBHOOK_IGNORED", {
          type: event.type
        }) 
    }
    return res.status(200).json({ received: true });
  };

  static async handle(req, res) {
    const event = req.body;
  
    validateEventShape(event);
  
    if (!ALLOWED_EVENTS.includes(event.type)) {
      return res.status(204).send(); // silently ignore
    }
  
    const obj = event.data.object;
  
    const payment = await assertKnownProviderRef(
      "stripe",
      obj.id
    );
  
    assertAmountMatch(payment, obj);
  
    switch (event.type) {
      case "payment_intent.succeeded":
        await PaymentService.confirmFromProviderEvent(
          payment.uuid,
          obj
        );
        break;
  
      case "payment_intent.failed":
        await PaymentService.markFailedFromProvider(
          payment.uuid,
          obj
        );
        break;
  
      case "charge.refunded":
        await RefundService.processProviderRefund(obj);
        break;
    }

    res.json({ received: true });
  }  
};
