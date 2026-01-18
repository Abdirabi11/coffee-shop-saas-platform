import prisma from "../../config/prisma.ts"
import { OrderEventBus } from "../../events/order.events.ts";
import { DeadLetterQueue } from "../../services/order/deadLetterQueue.service.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";

export class RefundOnCancelJob{
    static async run(orderUuid: string){
        try {
            const payment= await prisma.PaymentSnapshotService.findUnique({
                where: {orderUuid}
            });

            if (!payment) {
                throw new Error("Payment snapshot not found");
            }

            if (payment.refundedAt) {
                return;
            };

            await PaymentService.refund({
                provider: payment.provider,
                paymentIntentId: payment.providerPaymentId,
                amount: payment.total,
            });

            await prisma.paymentSnapshot.update({
                where: { orderUuid },
                data: {
                  refundedAt: new Date(),
                },
            });
        
            OrderEventBus.emit("PAYMENT_REFUNDED", {
                orderUuid,
                amount: payment.total,
            });
        } catch (error) {
            await DeadLetterQueue.record("REFUND_ON_CANCEL", {
                orderUuid,
                reason: error.message,
            });
            throw error;
        }
    }
};