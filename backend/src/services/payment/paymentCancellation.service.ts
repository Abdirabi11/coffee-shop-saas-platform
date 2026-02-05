import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payments/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";

// PaymentCancellationService.cancel should:
// lock payment
// mark failed / cancelled
// emit domain event
export class PaymentCancellationService{
    static async cancel(input: {
        paymentUuid: string;
        reason: string;
        cancelledBy: "SYSTEM" | "USER" | "ADMIN";
    }) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
            include: { paymentIntent: true },
        });
      
        if (!payment) throw new Error("PAYMENT_NOT_FOUND");

        PaymentStateMachine.assertTransition(
            payment.status,
            "CANCELLED"
        );

        await prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { uuid: payment.uuid },
                data: {
                  status: "CANCELLED",
                  cancelledAt: new Date(),
                  cancelReason: input.reason,
                },
            });
        });

        EventBus.emit("PAYMENT_CANCELLED", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
    }
};