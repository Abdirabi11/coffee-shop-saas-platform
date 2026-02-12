import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import prisma from "../../config/prisma.ts"

export class PaymentMethodSwitchService {
  
    static async switchMethod(input: {
      paymentUuid: string;
      newProvider: string;
      newPaymentMethod: string;
    }) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
        });
  
        if (!payment) {
            throw new Error("Payment not found");
        }
  
        if (payment.status !== "PENDING") {
            throw new Error("Can only switch payment method for pending payments");
        }
  
      // Cancel old payment intent with provider
        if (payment.providerRef) {
                await PaymentProviderAdapter.cancel({
                provider: payment.provider,
                providerRef: payment.providerRef,
            });
        }
    
      // Create new payment intent
        const newIntent = await PaymentProviderAdapter.createPaymentIntent({
            provider: input.newProvider,
            amount: payment.amount,
            currency: payment.currency,
            metadata: {
                orderUuid: payment.orderUuid,
            },
        });
  
      // Update payment
        await prisma.payment.update({
            where: { uuid: payment.uuid },
            data: {
                provider: input.newProvider,
                paymentMethod: input.newPaymentMethod,
                providerRef: newIntent.providerRef,
                clientSecret: newIntent.clientSecret,
            },
        });
  
        return newIntent;
    }
}
  