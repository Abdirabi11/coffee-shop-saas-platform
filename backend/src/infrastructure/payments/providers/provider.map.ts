import { EVCPlusProvider } from "./EVCPlusProvider.ts";
import { PaymentProvider } from "./payment-provider.interface.ts.ts";
import { StripeProvider } from "./stripe.provider.ts";
import { WalletProvider } from "./wallet.adapter.ts";

export const ProviderMap: Record<string, PaymentProvider> = {
    stripe: new StripeProvider(),
    wallet: new WalletProvider(),
    evc_plus: new EVCPlusProvider(),
};

export function getProvider(provider: string): PaymentProvider {
    const providerImpl = ProviderMap[provider.toLowerCase()];
    
    if (!providerImpl) {
      throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
    }
    
    return providerImpl;
}