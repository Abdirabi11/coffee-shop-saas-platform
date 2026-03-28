import type { PaymentProvider } from "./paymentProvider.interface.ts";
import { ProviderMap } from "./provider.map.ts";

// export const ProviderMap: Record<string, PaymentProvider> = {
//     STRIPE: new StripeProvider(),
//     WALLET: new WalletProvider(),
//     EVC_PLUS: new EVCPlusProvider(), 
// }; 
 
export function getProvider(provider: string): PaymentProvider {
    const key = provider.toUpperCase();
    const impl = ProviderMap[key];
    
    if (!impl) {
        throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
    } 
    
    return impl;
}
 
export class PaymentProviderAdapter {
    static createPaymentIntent(input: {
        provider: string;
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }) {
        const provider = getProvider(input.provider);
        return provider.createIntent(input);
    }
 
    static refund(input: {
        provider: string;
        providerRef: string;
        amount: number;
    }) {
        const provider = getProvider(input.provider);
        return provider.refund({
            providerRef: input.providerRef,
            amount: input.amount,
        });
    }
 
    static async lookup(payment: { provider: string; providerRef: string }) {
        const provider = getProvider(payment.provider);
        return provider.lookup(payment.providerRef);
    }
    
    static async cancel(input: { provider: string; providerRef: string }) {
        const provider = getProvider(input.provider);
        if (provider.cancel) {
            await provider.cancel({ providerRef: input.providerRef });
        }
        // If provider doesn't support cancel, silently ignore
    }
}