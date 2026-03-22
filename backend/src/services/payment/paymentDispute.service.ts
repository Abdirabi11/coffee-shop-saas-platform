import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class PaymentDisputeService {
    static async createFromWebhook(input: {
        provider: string;
        providerDisputeId: string;
        paymentUuid: string;
        amount: number;
        reason: string;
        reasonCode?: string;
        evidenceDueBy?: Date;
        snapshot: any;
    }) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
            include: { order: true },
        });
    
        if (!payment) {
            throw new Error("PAYMENT_NOT_FOUND");
        }
    
        // Idempotency
        const existing = await prisma.paymentDispute.findUnique({
            where: { providerDisputeId: input.providerDisputeId },
        });
    
        if (existing) {
            return existing;
        }
    
        const dispute = await prisma.paymentDispute.create({
            data: {
                tenantUuid: payment.tenantUuid,
                paymentUuid: payment.uuid,
                orderUuid: payment.orderUuid,
                storeUuid: payment.storeUuid,
        
                provider: input.provider.toUpperCase(),
                providerDisputeId: input.providerDisputeId,
        
                amount: input.amount,
                currency: payment.currency,
        
                reason: this.normalizeReason(input.reason),
                reasonCode: input.reasonCode,
        
                status: "OPEN",
                evidenceDueBy: input.evidenceDueBy,
        
                snapshot: input.snapshot,
        
                notifiedAt: new Date(),
            },
        });
    
        await prisma.adminAlert.create({
            data: {
                tenantUuid: payment.tenantUuid,
                storeUuid: payment.storeUuid,
                alertType: "PAYMENT_FAILED", 
                category: "FINANCIAL",
                level: "CRITICAL",
                priority: "HIGH",
                source: "WEBHOOK",
                title: "Payment Dispute Filed",
                message: `Dispute filed for payment ${payment.uuid} — Amount: ${input.amount / 100} ${payment.currency}`,
                context: {
                    subType: "DISPUTE_OPENED", // Distinguish from regular payment failures
                    disputeUuid: dispute.uuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    reason: input.reason,
                    amount: input.amount,
                    evidenceDueBy: input.evidenceDueBy,
                },
            },
        });
    
        // FIX #3: Audit trail
        await prisma.paymentAuditSnapshot.create({
            data: {
                tenantUuid: payment.tenantUuid,
                paymentUuid: payment.uuid,
                orderUuid: payment.orderUuid,
                storeUuid: payment.storeUuid,
                reason: "DISPUTE_OPENED",
                triggeredBy: "SYSTEM",
                beforeStatus: payment.status,
                afterStatus: payment.status, // Payment status doesn't change on dispute
                paymentState: payment,
                orderState: payment.order,
                metadata: {
                disputeUuid: dispute.uuid,
                providerDisputeId: input.providerDisputeId,
                disputeAmount: input.amount,
                disputeReason: input.reason,
                },
            },
        });
    
        EventBus.emit("DISPUTE_CREATED", {
            disputeUuid: dispute.uuid,
            paymentUuid: payment.uuid,
            tenantUuid: payment.tenantUuid,
            amount: input.amount,
        });
    
        logWithContext("warn", "[Dispute] Created from webhook", {
            disputeUuid: dispute.uuid,
            paymentUuid: payment.uuid,
            amount: input.amount,
            reason: input.reason,
        });
    
        return dispute;
    }
    
    static async submitEvidence(input: {
        disputeUuid: string;
        evidence: {
            customerName?: string;
            customerEmail?: string;
            customerPurchaseIp?: string;
            receiptUrl?: string;
            shippingDocumentation?: string;
            refundPolicy?: string;
            cancellationPolicy?: string;
            serviceDate?: string;
            productDescription?: string;
            customerCommunication?: string;
        };
        submittedBy: string;
    }) {
        const dispute = await prisma.paymentDispute.findUnique({
            where: { uuid: input.disputeUuid },
        });
    
        if (!dispute) {
            throw new Error("DISPUTE_NOT_FOUND");
        }
    
        if (dispute.status !== "OPEN" && dispute.status !== "NEEDS_RESPONSE") {
            throw new Error(`INVALID_DISPUTE_STATUS: ${dispute.status}`);
        }
    
        // Submit to provider
        await this.submitEvidenceToProvider(
            dispute.provider,
            dispute.providerDisputeId,
            input.evidence
        );
    
        const updated = await prisma.paymentDispute.update({
            where: { uuid: input.disputeUuid },
            data: {
                status: "EVIDENCE_SUBMITTED",
                evidenceSubmitted: input.evidence,
            },
        });
    
        logWithContext("info", "[Dispute] Evidence submitted", {
            disputeUuid: updated.uuid,
            submittedBy: input.submittedBy,
        });
    
        return updated;
    }
    
    static async acceptDispute(input: {
        disputeUuid: string;
        acceptedBy: string;
        notes?: string;
    }) {
        const dispute = await prisma.paymentDispute.findUnique({
            where: { uuid: input.disputeUuid },
        });
    
        if (!dispute) {
            throw new Error("DISPUTE_NOT_FOUND");
        }
    
        // Notify provider
        await this.acceptDisputeWithProvider(
            dispute.provider,
            dispute.providerDisputeId
        );
    
        const updated = await prisma.paymentDispute.update({
            where: { uuid: input.disputeUuid },
            data: {
                status: "ACCEPTED",
                resolution: "ACCEPTED",
                resolvedAt: new Date(),
                resolutionNotes: input.notes,
                chargedBackAmount: dispute.amount,
                chargedBackAt: new Date(),
            },
        });
    
        logWithContext("warn", "[Dispute] Accepted (chargeback)", {
            disputeUuid: updated.uuid,
            acceptedBy: input.acceptedBy,
            amount: dispute.amount,
        });
    
        return updated;
    }
 
    static async updateFromWebhook(input: {
        providerDisputeId: string;
        status: string;
        resolution?: string;
        snapshot: any;
    }) {
        const dispute = await prisma.paymentDispute.findUnique({
            where: { providerDisputeId: input.providerDisputeId },
        });
    
        if (!dispute) {
            throw new Error("DISPUTE_NOT_FOUND");
        }
    
        const status = this.normalizeStatus(input.status);
        const resolution = input.resolution
            ? this.normalizeResolution(input.resolution)
            : null;
    
        const isResolved = status === "WON" || status === "LOST" || status === "ACCEPTED";
    
        const updated = await prisma.paymentDispute.update({
            where: { uuid: dispute.uuid },
            data: {
                status,
                ...(resolution && { resolution }),
                ...(isResolved ? { resolvedAt: new Date() } : {}),
                ...(status === "LOST"
                    ? {
                        chargedBackAmount: dispute.amount,
                        chargedBackAt: new Date(),
                        }
                    : {}),
                snapshot: input.snapshot,
            },
        });
    
        if (status === "WON" || status === "LOST") {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid: dispute.tenantUuid,
                    storeUuid: dispute.storeUuid,
                    alertType: "PAYMENT_FAILED", // FIX #2: Valid AlertType enum
                    category: "FINANCIAL",
                    level: status === "WON" ? "INFO" : "CRITICAL",
                    priority: status === "WON" ? "LOW" : "HIGH",
                    source: "WEBHOOK",
                    title: `Dispute ${status === "WON" ? "Won" : "Lost"}`,
                    message: `Dispute ${dispute.providerDisputeId} was ${status.toLowerCase()} — Amount: ${dispute.amount / 100}`,
                    context: {
                        subType: `DISPUTE_${status}`, // Distinguish in context
                        disputeUuid: dispute.uuid,
                        paymentUuid: dispute.paymentUuid,
                        amount: dispute.amount,
                        resolution: status,
                    },
                },
            });
        }
    
        logWithContext("info", "[Dispute] Updated from webhook", {
            disputeUuid: updated.uuid,
            status,
            resolution,
        });
    
        return updated;
    }
 
    private static async submitEvidenceToProvider(
        provider: string,
        disputeId: string,
        evidence: any
    ) {
        switch (provider) {
            case "STRIPE": {
                const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
                await stripe.disputes.update(disputeId, {
                    evidence: {
                        customer_name: evidence.customerName,
                        customer_email_address: evidence.customerEmail,
                        customer_purchase_ip: evidence.customerPurchaseIp,
                        receipt: evidence.receiptUrl,
                        shipping_documentation: evidence.shippingDocumentation,
                        refund_policy: evidence.refundPolicy,
                        cancellation_policy: evidence.cancellationPolicy,
                        service_date: evidence.serviceDate,
                        product_description: evidence.productDescription,
                        customer_communication: evidence.customerCommunication,
                    },
                });
                break;
            }
            default:
                throw new Error(
                `EVIDENCE_SUBMISSION_NOT_SUPPORTED: ${provider}`
                );
        }
    }
    
    private static async acceptDisputeWithProvider(
        provider: string,
        disputeId: string
    ) {
        switch (provider) {
            case "STRIPE": {
                const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
                await stripe.disputes.close(disputeId);
                break;
            }
            default:
                throw new Error(
                `DISPUTE_ACCEPTANCE_NOT_SUPPORTED: ${provider}`
                );
        }
    }
    
    private static normalizeReason(reason: string): string {
        const mapping: Record<string, string> = {
            fraudulent: "FRAUDULENT",
            duplicate: "DUPLICATE",
            product_not_received: "PRODUCT_NOT_RECEIVED",
            product_unacceptable: "PRODUCT_UNACCEPTABLE",
            subscription_canceled: "SUBSCRIPTION_CANCELLED",
            credit_not_processed: "CREDIT_NOT_PROCESSED",
            general: "GENERAL",
        };
        return mapping[reason.toLowerCase()] || "GENERAL";
    }
    
    private static normalizeStatus(status: string): string {
        const mapping: Record<string, string> = {
            warning_needs_response: "NEEDS_RESPONSE",
            warning_under_review: "UNDER_REVIEW",
            needs_response: "NEEDS_RESPONSE",
            under_review: "UNDER_REVIEW",
            won: "WON",
            lost: "LOST",
            accepted: "ACCEPTED",
            expired: "EXPIRED",
        };
        return mapping[status.toLowerCase()] || "OPEN";
    }
    
    private static normalizeResolution(resolution: string): string {
        const mapping: Record<string, string> = {
            won: "WON",
            lost: "LOST",
            accepted: "ACCEPTED",
            withdrawn: "WITHDRAWN",
        };
        return mapping[resolution.toLowerCase()] || "LOST";
    }
}