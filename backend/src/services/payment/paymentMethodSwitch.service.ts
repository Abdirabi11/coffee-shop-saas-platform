import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { EventBus } from "../../events/eventBus.ts";

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
            throw new Error("PAYMENT_NOT_FOUND");
        }
    
        if (payment.status !== "PENDING") {
            throw new Error("CAN_ONLY_SWITCH_PENDING_PAYMENTS");
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
    
        const previousProvider = payment.provider;
        const previousMethod = payment.paymentMethod;
    
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
    
        await prisma.paymentAuditSnapshot.create({
            data: {
                tenantUuid: payment.tenantUuid,
                paymentUuid: payment.uuid,
                orderUuid: payment.orderUuid,
                storeUuid: payment.storeUuid,
                reason: "PAYMENT_METHOD_SWITCHED",
                triggeredBy: "USER",
                beforeStatus: payment.status,
                afterStatus: payment.status, // Status doesn't change
                paymentState: payment,
                orderState: {},
                metadata: {
                    previousProvider,
                    previousMethod,
                    newProvider: input.newProvider,
                    newMethod: input.newPaymentMethod,
                },
            },
        });
    
        EventBus.emit("PAYMENT_METHOD_SWITCHED", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            previousProvider,
            newProvider: input.newProvider,
        });
    
        logWithContext("info", "[PaymentMethodSwitch] Switched", {
            paymentUuid: payment.uuid,
            from: `${previousProvider}/${previousMethod}`,
            to: `${input.newProvider}/${input.newPaymentMethod}`,
        });
    
        return newIntent;
    }
}
  