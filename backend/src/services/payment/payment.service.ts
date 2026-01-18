import prisma from "../../config/prisma.ts"
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
    static async confirmPayment({
        orderUuid,
        provider,
        providerRef,
        snapshot,
    }: {
        orderUuid: string;
        provider: string;
        providerRef?: string;
        snapshot: any;
    }) {
        const order= await prisma.order.findUnique({
            where: { uuid: orderUuid },
        });
        if (!order) throw new Error("Order not found");

        await prisma.$transaction(async (tx)=> {
            await tx.payment.create({
                data: {
                    orderUuid,
                    storeUuid: order.storeUuid,
                    amount: order.totalAmount,
                    currency: "USD",
                    provider,
                    providerRef,
                    status: "PAID",
                    snapshot,
                }
            });

            await OrderStatusService.transition(orderUuid, "PAID");
        })
    };

    static async retry(){

    }
}