import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { PaymentProviderAdapter } from "../../payment/providers/payment-provider.adapter.js";
import { OrderStatusService } from "../order/order-status.service.ts";

const paymentSnapshot = {
    amount: 750,
    currency: "USD",
    provider: "stripe",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    chargedAt: new Date().toISOString(),
};

export class PaymentService{
    static async confirmPayment(input: {
        orderUuid: string;
        provider: string;
        providerRef: string;
        snapshot: any;
      }) {
        const order= await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
            include: { payment: true },
        });
        if (!order) throw new Error("Order not found");

        if (order.payment?.providerRef === input.providerRef) {
            return order.payment;
        };

        if (order.status !== "PAYMENT_PENDING") {
            throw new Error("INVALID_ORDER_STATE");
        };

        await prisma.$transaction(async (tx)=> {
            await tx.payment.create({
                data: {
                    orderUuid: order.uuid,
                    storeUuid: order.storeUuid,
                    amount: order.totalAmount,
                    currency: order.currency,
                    provider: input.provider,
                    providerRef: input.providerRef,
                    status: "PAID",
                    snapshot: input.snapshot,
                }
            });

            await tx.paymentSnapshot.update({
                where: { orderUuid: order.uuid },
                data: { status: "PAID" },
            });

            await OrderStatusService.transition(tx, order.uuid, "PAID");
        })

        EventBus.emit("PAYMENT_CONFIRMED", {
            orderUuid: order.uuid,
            storeUuid: order.storeUuid,
            amount: order.totalAmount,
        });
    }

    //Payment Intent + Lock (ANTI DOUBLE CHARGE)
    static async startPayment(orderUuid: string, provider: string){
        const order= await prisma.order.findUnique({
            where: {uuid: orderUuid}
        })
        if (!order) throw new Error("ORDER_NOT_FOUND");

        const existing= await prisma.order.findFirst({
            where: {
                orderUuid,
                lockedAt: {not: null}
            }
        });
        if (existing) {
            throw new Error("PAYMENT_ALREADY_IN_PROGRESS");
        };

        const payment= await prisma.payment.create({
            data: {
                orderUuid,
                provider,
                status: "PENDING",
                lockedAt: new Date(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            }
        });

        const intent= await PaymentProviderAdapter.createPaymentIntent({
            provider,
            amount: order.totalAmount,
            currency: order.currency,
            metadata: { orderUuid },
        });

        await prisma.payment.update({
            where: { uuid: payment.uuid },
            data: { providerRef: intent.providerRef },
        });
        
        return intent;
    }

    //⛔ Unlock on Fail
    static async unlockPayment(paymentUuid: string) {
        await prisma.payment.update({
          where: { uuid: paymentUuid },
          data: { lockedAt: null },
        });
    }

    static async isWebhookProcessed(){

    }
};