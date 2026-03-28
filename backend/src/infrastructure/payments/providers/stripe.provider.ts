import Stripe from "stripe";
import { logWithContext } from "../../observability/logger.ts";
import type  { PaymentProvider } from "./paymentProvider.interface.ts";


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});
 
// FIX #1: Single class replacing both StripeAdapter and StripeProvider
export class StripeProvider implements PaymentProvider {
    async createIntent(input: {
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }) {
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: input.amount,
                currency: input.currency.toLowerCase(),
                metadata: input.metadata,
                automatic_payment_methods: { enabled: true },
            });
        
            logWithContext("info", "[Stripe] Payment intent created", {
                intentId: paymentIntent.id,
                amount: input.amount,
            });
    
            return {
                providerRef: paymentIntent.id,
                clientSecret: paymentIntent.client_secret ?? undefined,
                status: this.normalizeStatus(paymentIntent.status),
                snapshot: paymentIntent,
            };
        } catch (error: any) {
            logWithContext("error", "[Stripe] Create intent failed", {
                error: error.message,
            });
            throw new Error(this.normalizeError(error));
        }
    }
 
    async lookup(providerRef: string) {
        try {
            const intent = await stripe.paymentIntents.retrieve(providerRef);
        
            return {
                status: intent.status === "succeeded" ? ("PAID" as const)
                : intent.status === "canceled" ? ("FAILED" as const)
                : ("PENDING" as const),
                providerRef: intent.id,
                snapshot: intent,
            };
        } catch (error: any) {
            logWithContext("error", "[Stripe] Lookup failed", {
                providerRef,
                error: error.message,
            });
            throw new Error("PROVIDER_UNAVAILABLE");
        }
    }
 
    async refund(input: { providerRef: string; amount: number }) {
        try {
            const refund = await stripe.refunds.create({
                payment_intent: input.providerRef,
                amount: input.amount,
            });
        
            logWithContext("info", "[Stripe] Refund created", {
                refundId: refund.id,
                amount: input.amount,
            });
        
            return {
                providerRef: refund.id,
                snapshot: refund,
            };
        } catch (error: any) {
            logWithContext("error", "[Stripe] Refund failed", {
                error: error.message,
            });
            throw new Error(this.normalizeError(error));
        }
    }
 
    async cancel(input: { providerRef: string }) {
        try {
            await stripe.paymentIntents.cancel(input.providerRef);
            logWithContext("info", "[Stripe] Intent cancelled", {
                intentId: input.providerRef,
            });
        } catch (error: any) {
            // Ignore if already cancelled
            if (error.code !== "payment_intent_unexpected_state") {
                throw error;
            }
        }
    }
 
    private normalizeStatus(
        status: string
    ): "REQUIRES_ACTION" | "PAID" | "FAILED" | "PENDING" {
        switch (status) {
            case "succeeded":
                return "PAID";
            case "requires_action":
            case "requires_confirmation":
            case "requires_payment_method":
                return "REQUIRES_ACTION";
            case "canceled":
                return "FAILED";
            default:
                return "PENDING";
        }
    }
    
    private normalizeError(error: any): string {
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
            case "fraudulent":
                return "FRAUD_SUSPECTED";
            case "rate_limit":
                return "PROVIDER_TIMEOUT";
            default:
                return "PROVIDER_UNAVAILABLE";
        }
    }
}