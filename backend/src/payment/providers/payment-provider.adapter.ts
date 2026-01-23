

interface PaymentIntentResult {
    providerRef: string;
    clientSecret?: string;
    status: "REQUIRES_ACTION" | "PAID" | "FAILED";
};
  
interface RefundResult {
    providerRef: string;
};

export class PaymentProviderAdapter{
    static async createPaymentIntent(input: {
        provider: "stripe" | "wallet";
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }) : Promise<PaymentIntentResult>{
        switch(input.provider){
            case "stripe":
              return StripeProvider.createIntent(input)
            
            case "wallet":
              return WalletProvider.createIntent(input);
            
            default:
              throw new Error("UNSUPPORTED_PROVIDER");
        } 
    };

    static async confirm(input: {
        provider: string;
        providerRef: string;
    }) {
        return ProviderMap[input.provider].confirm(input.providerRef);
    }

    static async refund(input: {
        provider: string;
        providerRef: string;
        amount: number;
    }) : Promise<RefundResult>{
        return ProviderMap[input.provider].refund(input);
    }

    static async lookup(payment: any){
        return ProviderMap[payment.provider].lookup(payment.providerRef);
    }
};