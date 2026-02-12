import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payments/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";

export class PaymentCancellationService{
    static async cancel(input: {
        paymentUuid: string;
        reason: string;
        cancelledBy: "SYSTEM" | "USER" | "ADMIN";
        cancelledByUuid?: string;
    }) {
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
            include: { order: true },
        });
          
        if (!payment) throw new Error("PAYMENT_NOT_FOUND");

        if (payment.status === "PAID" || payment.status === "REFUNDED") {
            throw new Error("CANNOT_CANCEL_COMPLETED_PAYMENT");
        };

        PaymentStateMachine.assertTransition( payment.status, "CANCELLED" );

        const updated= await prisma.$transaction(async (tx) => {
            const updated= await tx.payment.update({
                where: { uuid: payment.uuid },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancelReason: input.reason,
                    cancelledBy: input.cancelledBy,
                    cancelledByUuid: input.cancelledByUuid,
                },
            });

            // Update order status
            await tx.order.update({
                where: { uuid: payment.orderUuid },
                data: {
                  status: "CANCELLED",
                  paymentStatus: "CANCELLED",
                },
            });

            // Create audit snapshot
            await tx.paymentAuditSnapshot.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    storeUuid: payment.storeUuid,
                    reason: "PAYMENT_CANCELLED",
                    triggeredBy: input.cancelledByUuid || "SYSTEM",
                    beforeStatus: payment.status,
                    afterStatus: "CANCELLED",
                    paymentState: updated,
                    orderState: payment.order,
                    metadata: {
                        cancelledBy: input.cancelledBy,
                        cancelReason: input.reason,
                    },
                },
            });
            return updated;
        });

        EventBus.emit("PAYMENT_CANCELLED", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
      
        console.log(`[PaymentCancellation] Cancelled: ${payment.uuid} - ${input.reason}`);
        return updated;
    }
};