import { PaymentProvider } from "./payment-provider.interface.ts";


export class WalletProvider implements PaymentProvider{
    async createIntent(input: {
        amount: number;
        currency: string;
        metadata: Record<string, any>;
    }) {
        return {
            providerRef: "wallet_tx_" + Date.now(),
            status: "PAID",
        }
    }

    async lookup(providerRef: string) {
        return {
          status: "PAID",
          providerRef,
        };
    }

    async refund(input: { providerRef: string; amount: number }) {
        return {
          providerRef: "wallet_refund_" + Date.now(),
        };
    }
};

//💰 Wallet provider
if (
    await PaymentRestrictionService.hasRestriction(
      userUuid,
      "DISABLE_WALLET"
    )
  ){
    throw new Error("WALLET_DISABLED");
}