import { StripeAdapter } from "./stripe.adapter.ts";

export class PaymentProviderAdapter {
    static get(provider: string) {
      if (provider === "stripe") return new StripeAdapter();
      throw new Error("Unsupported provider");
    }
}