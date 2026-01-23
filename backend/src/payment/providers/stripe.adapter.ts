import { PaymentProvider } from "./Adapter-Interface.ts";


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
}