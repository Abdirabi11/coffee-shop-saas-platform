import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { WebhookVerifier } from "../../infrastructure/webhooks/webhookVerifier.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { RefundService } from "../../services/payment/Refund.service.ts";
import { PaymentDisputeService } from "../../services/payment/paymentDispute.service.ts";
 

const ALLOWED_EVENTS = [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.updated",  
    "charge.dispute.closed",  
];
 
// Idempotency service (inline — extract to separate file if it grows)
class WebhookIdempotencyService {
    static async isProcessed(provider: string, eventId: string): Promise<boolean> {
        const existing = await prisma.webhookEvent.findFirst({
            where: {
                provider: provider.toUpperCase() as any,
                providerEventUuid: eventId,
                status: { in: ["PROCESSED", "IGNORED"] },
            },
        });
        return !!existing;
    }
    
    static async markProcessed(provider: string, eventId: string) {
        await prisma.webhookEvent.updateMany({
            where: {
                provider: provider.toUpperCase() as any,
                providerEventUuid: eventId,
            },
            data: { status: "PROCESSED", processedAt: new Date() },
        });
    }
}
 
export class PaymentWebhookController {
    static async handleStripe(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `wh_${Date.now()}`;
    
        try {
            const signature = req.headers["stripe-signature"] as string;
            const rawBody = (req as any).rawBody;
        
            if (!signature) {
                logWithContext("warn", "[Webhook] Rejected — missing signature", { traceId });
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
                logWithContext("error", "[Webhook] Signature verification failed", {
                    traceId,
                    error: err.message,
                });
                return res.status(401).json({ error: "Invalid signature" });
            }
    
            // Idempotency check
            const isProcessed = await WebhookIdempotencyService.isProcessed(
                "stripe",
                event.id
            );
        
            if (isProcessed) {
                logWithContext("info", "[Webhook] Duplicate ignored", {
                    traceId,
                    eventId: event.id,
                    eventType: event.type,
                });
                return res.status(200).json({ received: true, duplicate: true });
            }
    
            logWithContext("info", "[Webhook] Received", {
                traceId,
                eventId: event.id,
                eventType: event.type,
            });
        
            // Validate event type
            if (!ALLOWED_EVENTS.includes(event.type)) {
                logWithContext("info", "[Webhook] Event type not handled", {
                    traceId,
                    eventType: event.type,
                });
                await WebhookIdempotencyService.markProcessed("stripe", event.id);
                return res.status(200).json({ received: true, ignored: true });
            };
    
            // Extract payment data
            const data = event.data.object;
            const orderUuid = data.metadata?.orderUuid;
        
            // For dispute events, orderUuid might not be in metadata
            const isDisputeEvent = event.type.startsWith("charge.dispute");
    
            if (!orderUuid && !isDisputeEvent) {
                logWithContext("warn", "[Webhook] Missing orderUuid in metadata", {
                    traceId,
                    eventId: event.id,
                    eventType: event.type,
                });
                await WebhookIdempotencyService.markProcessed("stripe", event.id);
                return res.status(200).json({ received: true, error: "Missing orderUuid" });
            }
    
            // Find payment in our system (skip for dispute events that use providerDisputeId)
            let payment: any = null;
    
            if (!isDisputeEvent) {
                payment = await prisma.payment.findFirst({
                    where: {
                        orderUuid,
                        provider: "STRIPE",
                        // FIX #2: Was `data.od` — typo, should be `data.id`
                        providerRef: data.id,
                    },
                });
        
                if (!payment) {
                    logWithContext("warn", "[Webhook] Payment not found", {
                        traceId,
                        eventId: event.id,
                        orderUuid,
                        providerRef: data.id, // FIX #2: Was `data.od`
                    });
                    await WebhookIdempotencyService.markProcessed("stripe", event.id);
                    return res.status(200).json({ received: true, error: "Payment not found" });
                }
            }
    
            // Amount validation for payment success
            if (event.type === "payment_intent.succeeded" && payment) {
                if (data.amount !== payment.amount) {
                    logWithContext("error", "[Webhook] Amount mismatch — possible fraud", {
                        traceId,
                        eventId: event.id,
                        expectedAmount: payment.amount,
                        receivedAmount: data.amount,
                    });
                    return res.status(400).json({ error: "Amount mismatch" });
                }
            }
    
            // Process event
            try {
                switch (event.type) {
                case "payment_intent.succeeded": {
                    await PaymentService.confirmFromProviderEvent({
                        paymentUuid: payment.uuid,
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
                    // For disputes, find payment via the charge's payment_intent
                    const disputePayment = await prisma.payment.findFirst({
                        where: { provider: "STRIPE", providerRef: data.payment_intent },
                    });
        
                    if (disputePayment) {
                        await PaymentDisputeService.createFromWebhook({
                            provider: "stripe",
                            providerDisputeId: data.id,
                            paymentUuid: disputePayment.uuid,
                            amount: data.amount,
                            reason: data.reason,
                            reasonCode: data.reason,
                            evidenceDueBy: data.evidence_details?.due_by
                                ? new Date(data.evidence_details.due_by * 1000)
                                : undefined,
                            snapshot: data,
                        });
                    }
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
                    logWithContext("warn", "[Webhook] Unhandled event in switch", {
                        traceId,
                        eventType: event.type,
                    });
                }
            } catch (processingError: any) {
                logWithContext("error", "[Webhook] Processing failed", {
                    traceId,
                    eventId: event.id,
                    eventType: event.type,
                    error: processingError.message,
                });
        
                // Dead letter queue for retry
                await prisma.webhookDeadLetter.create({
                    data: {
                        provider: "STRIPE",
                        eventUuid: event.id,
                        eventType: event.type,
                        payload: event,
                        errorMessage: processingError.message,
                        status: "FAILED",
                    },
                });
        
                return res.status(500).json({ error: "Processing failed" });
            }
        
            // Mark as processed
            await WebhookIdempotencyService.markProcessed("stripe", event.id);
        
            logWithContext("info", "[Webhook] Processed successfully", {
                traceId,
                eventId: event.id,
                eventType: event.type,
            });
        
            return res.status(200).json({ received: true });
        } catch (err: any) {
            logWithContext("error", "[Webhook] Handler error", {
                traceId,
                error: err.message,
            });
            return res.status(500).json({ error: "Internal server error" });
        }
    }
    
    // EVC Plus webhook handler
    static async handleEVC(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `wh_evc_${Date.now()}`;
    
        try {
            const signature = req.headers["x-evc-signature"] as string;
        
            if (!signature) {
                return res.status(400).json({ error: "Missing signature" });
            }
        
            // Verify HMAC signature
            let verified: boolean;
            try {
                verified = await WebhookVerifier.verify({
                    provider: "evc_plus",
                    signature,
                    rawBody: JSON.stringify(req.body),
                });
            } catch {
                return res.status(401).json({ error: "Invalid signature" });
            }
        
            const { transaction_id, status, metadata } = req.body;
            const orderUuid = metadata?.orderUuid;
        
            if (!orderUuid || !transaction_id) {
                return res.status(200).json({ received: true, error: "Missing data" });
            }
        
            // Idempotency
            const isProcessed = await WebhookIdempotencyService.isProcessed(
                "evc_plus",
                transaction_id
            );
            if (isProcessed) {
                return res.status(200).json({ received: true, duplicate: true });
            }
        
            const payment = await prisma.payment.findFirst({
                where: { orderUuid, provider: "EVC_PLUS", providerRef: transaction_id },
            });
        
            if (!payment) {
                await WebhookIdempotencyService.markProcessed("evc_plus", transaction_id);
                return res.status(200).json({ received: true, error: "Payment not found" });
            }
    
            // Process based on status
            const normalizedStatus = status?.toLowerCase();
        
            if (normalizedStatus === "completed" || normalizedStatus === "success") {
                await PaymentService.confirmFromProviderEvent({
                    paymentUuid: payment.uuid,
                    providerRef: transaction_id,
                    snapshot: req.body,
                });
            } else if (normalizedStatus === "failed" || normalizedStatus === "rejected") {
                await PaymentService.markFailedFromProvider({
                    paymentUuid: payment.uuid,
                    failureCode: "PROVIDER_DECLINED",
                    failureReason: req.body.error_message || "EVC payment failed",
                    snapshot: req.body,
                });
            }
        
            await WebhookIdempotencyService.markProcessed("evc_plus", transaction_id);
    
            logWithContext("info", "[Webhook] EVC processed", {
                traceId,
                transactionId: transaction_id,
                status: normalizedStatus,
            });
        
            return res.status(200).json({ received: true });
        } catch (err: any) {
            logWithContext("error", "[Webhook] EVC handler error", {
                traceId,
                error: err.message,
            });
            return res.status(500).json({ error: "Internal server error" });
        }
    }
    
    private static normalizeStripeError(error: any): string {
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
}