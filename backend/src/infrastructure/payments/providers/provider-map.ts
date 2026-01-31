import { PaymentProvider } from "./payment-provider.interface.ts.ts";
import { StripeProvider } from "./stripe.provider.ts";
import { WalletProvider } from "./wallet.adapter.ts";

export const ProviderMap: Record<string, PaymentProvider> = {
    stripe: new StripeProvider(),
    wallet: new WalletProvider(),
};