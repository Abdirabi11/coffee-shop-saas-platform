import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { PaymentService } from "../../services/payment/payment.service.ts";
import { RefundService } from "../../services/payment/refund.service.ts";
import { WebhookIdempotencyService } from "../../infrastructure/webhooks/webhookIdempotency.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { RiskPolicyEnforcer } from "../../services/fraud/riskPolicyEnforcer.service.ts";
import { env } from "../../config/env.ts";
import { MetricsService } from "../../infrastructure/observability/metrics.ts";
import { WebhookDeadLetterQueue } from "../../services/webhooks/WebhookDeadLetterQueue.service.ts";
import { PaymentDisputeService } from "../../services/payment/paymentDispute.service.ts";
import { WebhookVerifier } from "../../infrastructure/webhooks/webhookVerifier.ts";

const ALLOWED_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
];

export class PaymentWebhookController{
  static async handleStripe (req: Request, res: Response){

    const traceId = (req.headers["x-trace-id"] as string) || `wh_${Date.now()}`;

    try {
      const signature = req.headers["stripe-signature"] as string;
      const rawBody = req.rawBody; 
      
      if (!signature) {
        logWithContext("warn", "Webhook rejected - missing signature", { traceUuid });
        return res.status(400).json({ error: "Missing signature" });
      };

      // Verify webhook signature
      let event: any;
      try {
        event = await WebhookVerifier.verify({
          provider: "stripe",
          signature,
          rawBody,
        });
      } catch (err: any) {
        logWithContext("error", "Webhook signature verification failed", {
          traceId,
          error: err.message,
        });
        return res.status(401).json({ error: "Invalid signature" });
      };

      //Checking idempotency (prevent duplicate processing)
      const isProcessed = await WebhookIdempotencyService.isWebhookProcessed(
        "stripe",
        event.id
      );

      if (isProcessed) {
        logWithContext("info", "Duplicate webhook ignored", {
          traceId,
          eventId: event.id,
          eventType: event.type,
        });
        return res.status(200).json({ received: true, duplicate: true });
      };

      logWithContext("info", "Webhook received", {
        traceId,
        eventId: event.id,
        eventType: event.type,
      });

      //Validate event type
      if (!ALLOWED_EVENTS.includes(event.type)) {
        logWithContext("info", "Webhook event type not handled", {
          traceId,
          eventType: event.type,
        });
        
        // Mark as processed to prevent retries
        await WebhookIdempotencyService.markProcessed("stripe", event.id);
        
        return res.status(200).json({ received: true, ignored: true });
      };

      //Extract payment data
      const data = event.data.object;
      const orderUuid = data.metadata?.orderUuid;

      if (!orderUuid) {
        logWithContext("warn", "Webhook missing orderUuid in metadata", {
          traceId,
          eventUuid: event.uuid,
          eventType: event.type,
        });
        
        await WebhookIdempotencyService.markProcessed("stripe", event.uuid);
        return res.status(200).json({ received: true, error: "Missing orderUuid" });
      };

      //Verifying payment exists in our system
      const payment = await prisma.payment.findFirst({
        where: {
          orderUuid,
          provider: "STRIPE",
          providerRef: data.id,
        },
      });

      if (!payment) {
        logWithContext("warn", "Payment not found for webhook", {
          traceId,
          eventId: event.id,
          orderUuid,
          providerRef: data.od,
        });
        
        await WebhookIdempotencyService.markProcessed("stripe", event.id);
        return res.status(200).json({ received: true, error: "Payment not found" });
      }

      //Validate amount matches (prevent fraud)
      if (event.type === "payment_intent.succeeded") {
        if (data.amount !== payment.amount) {
          logWithContext("error", "Webhook amount mismatch", {
            traceId,
            eventId: event.id,
            expectedAmount: payment.amount,
            receivedAmount: data.amount,
          });
          
          return res.status(400).json({ error: "Amount mismatch" });
        }
      }

      //Process event based on type
      try {
        switch (event.type) {
          case "payment_intent.succeeded": {
            await PaymentService.confirmFromProviderEvent({
              paymentUuid: payment.uuid,
              provider: "stripe",
              providerRef: data.id,
              snapshot: data,
            });
            
            MetricsService.increment("payment.webhook.success", 1, {
              provider: "stripe",
            });

            break;
          }

          case "payment_intent.payment_failed": {
            await PaymentService.markFailedFromProvider({
              paymentUuid: payment.uuid,
              failureCode: this.normalizeStripeError(data.last_payment_error),
              failureReason: data.last_payment_error?.message,
              snapshot: data,
            });
            
            MetricsService.increment("payment.webhook.failed", 1, {
              provider: "stripe",
            });

            break;
          }

          case "payment_intent.canceled": {
            await PaymentService.cancelFromProvider({
              paymentUuid: payment.uuid,
              snapshot: data,
            });

            break;
          }

          case "charge.refunded": {
            await RefundService.processProviderRefund({
              provider: "stripe",
              providerRef: data.payment_intent,
              amount: data.amount_refunded,
              snapshot: data,
            });
            
            MetricsService.increment("refund.webhook.processed", 1, {
              provider: "stripe",
            });
            break;
          }

          case "charge.dispute.created": {
            // Handle chargeback/dispute
            await PaymentDisputeService.createFromWebhook({
              provider: "stripe",
              providerDisputeId: data.id,
              paymentUuid: payment.uuid,
              amount: data.amount,
              reason: data.reason,
              reasonCode: data.reason,
              evidenceDueBy: data.evidence_details?.due_by 
                ? new Date(data.evidence_details.due_by * 1000) 
                : undefined,
              snapshot: data,
            });
            break;
          }

          case "charge.dispute.updated": {
            await PaymentDisputeService.updateFromWebhook({
              providerDisputeId: data.id,
              status: data.status,
              snapshot: data,
            });
            break;
          }

          case "charge.dispute.closed": {
            await PaymentDisputeService.updateFromWebhook({
              providerDisputeId: data.id,
              status: data.status,
              resolution: data.status, 
              snapshot: data,
            });
            break;
          }
          
          default:
            logWithContext("warn", "Unhandled webhook event type", {
              traceUuid,
              eventType: event.type,
            });
        };
      } catch (processingError: any) {
        logWithContext("error", "Webhook processing failed", {
          traceUuid,
          eventUuid: event.uuid,
          eventType: event.type,
          error: processingError.message,
        });

        await WebhookDeadLetterQueue.add({
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          payload: event,
          error: processingError.message,
          attemptCount: 1,
        });
        
        return res.status(500).json({ error: "Processing failed" });
      };

      //Mark as processed
      await WebhookIdempotencyService.markProcessed("stripe", event.uuid);

      //Store webhook event for audit trail
      await prisma.webhookEvent.create({
        data: {
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          payload: event,
          processedAt: new Date(),
        },
      });

      logWithContext("info", "Webhook processed successfully", {
        traceId,
        eventId: event.id,
        eventType: event.type,
      });

      return res.status(200).json({ received: true });
    }catch(err: any){
      logWithContext("error", "Webhook handler error", {
        traceId,
        error: err.message,
        stack: err.stack,
      });
      
      return res.status(500).json({ err: "Internal server error" });
    }
  }

  private static normalizeStripeError(error: any): string{
    if (!error) return "UNKNOWN_ERROR";

    const code = error.code || error.decline_code;

    switch (code) {
      case "card_declined":
        return "CARD_DECLINED";
      case "insufficient_funds":
        return "INSUFFICIENT_FUNDS";
      case "expired_card":
        return "CARD_EXPIRED";
      case "incorrect_cvc":
        return "INVALID_CVV";
      case "authentication_required":
        return "AUTHENTICATION_REQUIRED";
      case "processing_error":
        return "PROVIDER_UNAVAILABLE";
      default:
        return "UNKNOWN_ERROR";
    }
  }

  // private static async handleDispute(payment: any, data: any) {
  //   await prisma.paymentDispute.create({
  //     data: {
  //       paymentUuid: payment.uuid,
  //       orderUuid: payment.orderUuid,
  //       tenantUuid: payment.tenantUuid,
  //       provider: "STRIPE",
  //       providerDisputeId: data.id,
  //       amount: data.amount,
  //       reason: data.reason,
  //       status: "OPEN",
  //       evidence: data.evidence || {},
  //       snapshot: data,
  //     },
  //   });

  //   // Alert admin
  //   await prisma.adminAlert.create({
  //     data: {
  //       tenantUuid: payment.tenantUuid,
  //       storeUuid: payment.storeUuid,
  //       alertType: "PAYMENT_DISPUTE",
  //       category: "FINANCIAL",
  //       level: "CRITICAL",
  //       priority: "HIGH",
  //       title: "Payment Dispute Created",
  //       message: `Dispute filed for payment ${payment.uuid} - Amount: ${data.amount / 100}`,
  //       context: {
  //         paymentUuid: payment.uuid,
  //         disputeId: data.id,
  //         reason: data.reason,
  //       },
  //     },
  //   });
  // };
};
