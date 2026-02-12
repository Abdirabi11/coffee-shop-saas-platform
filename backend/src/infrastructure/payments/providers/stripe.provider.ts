import { PaymentProvider } from "./payment-provider.interface.ts.ts";

export class StripeAdapter implements PaymentProvider {
  async confirm(intent: any) {
    return {
      providerRef: intent.id,
      snapshot: intent,
    };
  }

  async refund(input: { amount: number; paymentRef: string }) {
    // call stripe refunds.create(...)
    return "stripe_refund_id";
  }

  normalizeError(error: any) {
    switch (error.code) {
      case "card_declined":
        return "CARD_DECLINED";
      case "insufficient_funds":
        return "INSUFFICIENT_FUNDS";
      case "fraudulent":
        return "FRAUD_SUSPECTED";
      case "timeout":
        return "PROVIDER_TIMEOUT";
      default:
        return "PROVIDER_UNAVAILABLE";
    }
  }
}

export class StripeProvider implements PaymentProvider {
  async createIntent(input: {
    amount: number;
    currency: string;
    metadata: Record<string, any>;
  }) {
    // stripe.paymentIntents.create(...)
    const intent = {
      id: "pi_xxx",
      client_secret: "secret_xxx",
      status: "requires_action",
    };

    return {
      providerRef: intent.id,
      clientSecret: intent.client_secret,
      status: "REQUIRES_ACTION",
      snapshot: intent,
    };
  }

  async lookup(providerRef: string) {
    // stripe.paymentIntents.retrieve(...)
    const intent = { id: providerRef, status: "succeeded" };

    return {
      status: intent.status === "succeeded" ? "PAID" : "FAILED",
      providerRef: intent.id,
      snapshot: intent,
    };
  }

  async refund(input: { providerRef: string; amount: number }) {
    // stripe.refunds.create(...)
    const refund = { id: "re_xxx" };

    return {
      providerRef: refund.id,
      snapshot: refund,
    };
  }
};