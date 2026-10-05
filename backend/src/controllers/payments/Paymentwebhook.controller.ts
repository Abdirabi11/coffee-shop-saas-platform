import type { Request, Response } from "express";
import type { WebhookProvider } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { WebhookVerifier } from "../../infrastructure/webhooks/webhookVerifier.ts";
import { WebhookEventLedger } from "../../infrastructure/webhooks/webhookEventLedger.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
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

// Webhook processing order for every provider:
//   1. verify the signature over the raw request bytes
//   2. claim the VERIFIED event id in the WebhookEvent ledger (unique insert)
//   3. process
//   4. mark PROCESSED / IGNORED, or FAILED + non-2xx so the provider retries
// A duplicate delivery stops at step 2 with a 200; a concurrent one gets a
// 409 and is retried by the provider after the first finishes.
export class PaymentWebhookController {
    static async handleStripe(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `wh_${Date.now()}`;
        const provider: WebhookProvider = "STRIPE";

        const signature = req.headers["stripe-signature"] as string;
        const rawBody = req.rawBody;

        if (!signature || !rawBody) {
            logWithContext("warn", "[Webhook] Rejected — missing signature or body", { traceId });
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

        try {
            const claim = await WebhookEventLedger.claim({
                provider,
                eventId: event.id,
                eventType: event.type,
                payload: event,
                sourceIp: req.ip || "unknown",
                userAgent: req.headers["user-agent"],
                signatureHeader: signature,
            });

            if (claim.outcome === "DUPLICATE") {
                logWithContext("info", "[Webhook] Duplicate ignored", {
                    traceId,
                    eventId: event.id,
                    eventType: event.type,
                });
                return res.status(200).json({ received: true, duplicate: true });
            }
            if (claim.outcome === "IN_PROGRESS") {
                return res.status(409).json({ error: "Event is being processed" });
            }
        } catch (err: any) {
            logWithContext("error", "[Webhook] Ledger claim failed", { traceId, error: err.message });
            return res.status(500).json({ error: "Internal server error" });
        }

        logWithContext("info", "[Webhook] Received", {
            traceId,
            eventId: event.id,
            eventType: event.type,
        });

        try {
            const result = await PaymentWebhookController.processStripeEvent(event, traceId);
            await WebhookEventLedger.complete(provider, event.id, result.status, result.detail);

            logWithContext("info", "[Webhook] Processed", {
                traceId,
                eventId: event.id,
                eventType: event.type,
                status: result.status,
            });

            return res.status(200).json({ received: true, ...(result.status === "IGNORED" && { ignored: true }) });
        } catch (processingError: any) {
            logWithContext("error", "[Webhook] Processing failed", {
                traceId,
                eventId: event.id,
                eventType: event.type,
                error: processingError.message,
            });

            await WebhookEventLedger.fail(provider, event.id, processingError.message).catch(() => {});

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
            }).catch(() => {});

            return res.status(500).json({ error: "Processing failed" });
        }
    }

    private static async processStripeEvent(
        event: any,
        traceId: string
    ): Promise<{ status: "PROCESSED" | "IGNORED"; detail?: Record<string, unknown> }> {
        if (!ALLOWED_EVENTS.includes(event.type)) {
            return { status: "IGNORED", detail: { reason: "UNHANDLED_EVENT_TYPE" } };
        }

        const data = event.data.object;
        const isDisputeEvent = event.type.startsWith("charge.dispute");

        if (event.type === "charge.refunded") {
            // amount_refunded is the charge's cumulative refunded total
            await RefundService.processProviderRefund({
                provider: "stripe",
                providerRef: data.payment_intent,
                totalRefunded: data.amount_refunded,
                chargeId: data.id,
                snapshot: data,
            });
            MetricsService.increment("refund.webhook.processed", 1, { provider: "stripe" });
            return { status: "PROCESSED" };
        }

        if (isDisputeEvent) {
            return this.processStripeDispute(event.type, data);
        }

        // payment_intent.* events
        const orderUuid = data.metadata?.orderUuid;
        if (!orderUuid) {
            logWithContext("warn", "[Webhook] Missing orderUuid in metadata", {
                traceId,
                eventId: event.id,
            });
            return { status: "IGNORED", detail: { reason: "MISSING_ORDER_UUID" } };
        }

        // The webhook can beat the providerRef write in attachProviderIntent
        // (or that write can fail after Stripe created the intent), so also
        // match the placeholder by the paymentUuid we put in the intent's
        // metadata. Ignoring the event here would lose a real capture: the
        // ledger would mark it IGNORED and Stripe's retries become duplicates.
        const metadataPaymentUuid: unknown = data.metadata?.paymentUuid;
        const payment = await prisma.payment.findFirst({
            where: {
                orderUuid,
                provider: "STRIPE",
                OR: [
                    { providerRef: data.id },
                    ...(typeof metadataPaymentUuid === "string"
                        ? [{ uuid: metadataPaymentUuid, providerRef: null }]
                        : []),
                ],
            },
            select: { uuid: true, providerRef: true },
        });

        if (payment && !payment.providerRef) {
            await prisma.payment.updateMany({
                where: { uuid: payment.uuid, providerRef: null },
                data: { providerRef: data.id },
            });
        }

        if (!payment) {
            logWithContext("warn", "[Webhook] Payment not found", {
                traceId,
                eventId: event.id,
                orderUuid,
                providerRef: data.id,
            });
            return { status: "IGNORED", detail: { reason: "PAYMENT_NOT_FOUND" } };
        }

        switch (event.type) {
            case "payment_intent.succeeded": {
                // amount_received (not amount) is what was actually collected
                const { outcome } = await PaymentService.confirmFromProviderEvent({
                    paymentUuid: payment.uuid,
                    providerRef: data.id,
                    amountReceived: typeof data.amount_received === "number" ? data.amount_received : null,
                    currency: typeof data.currency === "string" ? data.currency : null,
                    snapshot: data,
                    source: "WEBHOOK",
                });
                MetricsService.increment("payment.webhook.success", 1, { provider: "stripe" });
                return { status: "PROCESSED", detail: { outcome } };
            }

            case "payment_intent.payment_failed": {
                await PaymentService.markFailedFromProvider({
                    paymentUuid: payment.uuid,
                    failureCode: this.normalizeStripeError(data.last_payment_error),
                    failureReason: data.last_payment_error?.message,
                    snapshot: data,
                });
                MetricsService.increment("payment.webhook.failed", 1, { provider: "stripe" });
                return { status: "PROCESSED" };
            }

            case "payment_intent.canceled": {
                await PaymentService.cancelFromProvider({
                    paymentUuid: payment.uuid,
                    snapshot: data,
                });
                return { status: "PROCESSED" };
            }
        }

        return { status: "IGNORED", detail: { reason: "UNHANDLED_EVENT_TYPE" } };
    }

    private static async processStripeDispute(
        type: string,
        data: any
    ): Promise<{ status: "PROCESSED" | "IGNORED"; detail?: Record<string, unknown> }> {
        switch (type) {
            case "charge.dispute.created": {
                // For disputes, find payment via the charge's payment_intent
                const disputePayment = await prisma.payment.findFirst({
                    where: { provider: "STRIPE", providerRef: data.payment_intent },
                });

                if (!disputePayment) {
                    return { status: "IGNORED", detail: { reason: "PAYMENT_NOT_FOUND" } };
                }

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
                return { status: "PROCESSED" };
            }

            case "charge.dispute.updated":
                await PaymentDisputeService.updateFromWebhook({
                    providerDisputeId: data.id,
                    status: data.status,
                    snapshot: data,
                });
                return { status: "PROCESSED" };

            case "charge.dispute.closed":
                await PaymentDisputeService.updateFromWebhook({
                    providerDisputeId: data.id,
                    status: data.status,
                    resolution: data.status,
                    snapshot: data,
                });
                return { status: "PROCESSED" };
        }

        return { status: "IGNORED", detail: { reason: "UNHANDLED_EVENT_TYPE" } };
    }

    // EVC Plus webhook handler
    // Body arrives raw (see server.ts) so the HMAC is checked over the exact
    // bytes EVC signed, not a re-serialization of parsed JSON.
    static async handleEVC(req: Request, res: Response) {
        const traceId = (req.headers["x-trace-id"] as string) || `wh_evc_${Date.now()}`;
        const provider: WebhookProvider = "EVC_PLUS";

        const signature = req.headers["x-evc-signature"] as string;
        const rawBody = req.rawBody;

        if (!signature || !rawBody) {
            return res.status(400).json({ error: "Missing signature" });
        }

        let body: any;
        try {
            body = await WebhookVerifier.verify({
                provider: "evc_plus",
                signature,
                rawBody,
            });
        } catch {
            return res.status(401).json({ error: "Invalid signature" });
        }

        const { transaction_id, status, metadata } = body ?? {};
        const orderUuid = metadata?.orderUuid;
        const normalizedStatus = typeof status === "string" ? status.toLowerCase() : "unknown";

        if (!orderUuid || !transaction_id) {
            return res.status(200).json({ received: true, error: "Missing data" });
        }

        // One transaction sends several callbacks (pending → completed), so
        // the event id is transaction + status, not the transaction alone.
        // TODO: switch to EVC's own event/notification id if the API has one.
        const eventId = `${transaction_id}:${normalizedStatus}`;

        try {
            const claim = await WebhookEventLedger.claim({
                provider,
                eventId,
                eventType: `payment.${normalizedStatus}`,
                payload: body,
                sourceIp: req.ip || "unknown",
                userAgent: req.headers["user-agent"],
                signatureHeader: signature,
            });

            if (claim.outcome === "DUPLICATE") {
                return res.status(200).json({ received: true, duplicate: true });
            }
            if (claim.outcome === "IN_PROGRESS") {
                return res.status(409).json({ error: "Event is being processed" });
            }
        } catch (err: any) {
            logWithContext("error", "[Webhook] EVC ledger claim failed", { traceId, error: err.message });
            return res.status(500).json({ error: "Internal server error" });
        }

        try {
            const payment = await prisma.payment.findFirst({
                where: { orderUuid, provider: "EVC_PLUS", providerRef: transaction_id },
                select: { uuid: true },
            });

            if (!payment) {
                await WebhookEventLedger.complete(provider, eventId, "IGNORED", { reason: "PAYMENT_NOT_FOUND" });
                return res.status(200).json({ received: true, error: "Payment not found" });
            }

            if (normalizedStatus === "completed" || normalizedStatus === "success") {
                const amount = Number(body.amount);
                const { outcome } = await PaymentService.confirmFromProviderEvent({
                    paymentUuid: payment.uuid,
                    providerRef: transaction_id,
                    // EVC reports major units; payments are stored in cents
                    // TODO: confirm amount/currency field names against EVC docs
                    amountReceived: Number.isFinite(amount) ? Math.round(amount * 100) : null,
                    currency: typeof body.currency === "string" ? body.currency : null,
                    snapshot: body,
                    source: "WEBHOOK",
                });
                await WebhookEventLedger.complete(provider, eventId, "PROCESSED", { outcome });
            } else if (normalizedStatus === "failed" || normalizedStatus === "rejected") {
                await PaymentService.markFailedFromProvider({
                    paymentUuid: payment.uuid,
                    failureCode: "PROVIDER_DECLINED",
                    failureReason: body.error_message || "EVC payment failed",
                    snapshot: body,
                });
                await WebhookEventLedger.complete(provider, eventId, "PROCESSED");
            } else {
                await WebhookEventLedger.complete(provider, eventId, "IGNORED", { reason: "NON_FINAL_STATUS" });
            }

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
            await WebhookEventLedger.fail(provider, eventId, err.message).catch(() => {});
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
