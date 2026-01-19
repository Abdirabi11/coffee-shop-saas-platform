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
    static async confirmPayment(input: {
        orderUuid: string;
        provider: string;
        providerRef: string;
        snapshot: any;
      }) {
        const order= await prisma.order.findUnique({
            where: { uuid: input.orderUuid },
        });
        if (!order) throw new Error("Order not found");
        if (order.status !== "PENDING_PAYMENT") {
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
    };
}