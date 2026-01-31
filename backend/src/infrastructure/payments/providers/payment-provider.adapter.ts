import { ProviderMap } from "./provider-map.ts";

// interface PaymentIntentResult {
//     providerRef: string;
//     clientSecret?: string;
//     status: "REQUIRES_ACTION" | "PAID" | "FAILED";
// };

// You should normalize to:
// INSUFFICIENT_FUNDS
// CARD_DECLINED
// PROVIDER_TIMEOUT
// PROVIDER_UNAVAILABLE
// FRAUD_SUSPECTED
export class PaymentProviderAdapter{
    static createPaymentIntent(input: {
        provider: string;
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }){
        const providerImpl = ProviderMap[input.provider];
        if (!providerImpl) throw new Error("UNSUPPORTED_PROVIDER");
    
        return providerImpl.createIntent(input);
    }

    static refund(input: {
        provider: string;
        providerRef: string;
        amount: number;
    }) {
        const providerImpl = ProviderMap[input.provider];
        if (!providerImpl) throw new Error("UNSUPPORTED_PROVIDER");
    
        return providerImpl.refund({
          providerRef: input.providerRef,
          amount: input.amount,
        });
    }
    
    static async lookup(payment: any){
        return ProviderMap[payment.provider].lookup(payment.providerRef);
    }
};