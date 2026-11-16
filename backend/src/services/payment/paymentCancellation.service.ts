import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/PaymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";

export class PaymentCancellationService {
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
    
        if (payment.status === "PAID" || payment.status === "COMPLETED" || payment.status === "REFUNDED") {
            throw new Error("CANNOT_CANCEL_COMPLETED_PAYMENT");
        }
    
        PaymentStateMachine.assertTransition(payment.status, "CANCELLED");
    
        const updated = await prisma.$transaction(async (tx) => {
            // Only from the status checked above: a provider webhook may have
            // confirmed the payment since it was read, and that must win
            const claimed = await tx.payment.updateMany({
                where: { uuid: payment.uuid, status: payment.status },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancelReason: input.reason,
                    cancelledBy: input.cancelledBy,
                    cancelledByUuid: input.cancelledByUuid,
                },
            });
            if (claimed.count === 0) throw new Error("PAYMENT_STATUS_CHANGED");
            const updated = await tx.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } });
    
            await tx.order.update({
                where: { uuid: payment.orderUuid },
                data: {
                    status: "CANCELLED",
                    paymentStatus: "CANCELLED",
                },
            });
    
            await tx.paymentAuditSnapshot.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    storeUuid: payment.storeUuid,
                    // SnapshotReason has no CANCELLED value; afterStatus records
                    // the cancellation, the reason who drove it (expiry job vs a person)
                    reason: input.cancelledBy === "SYSTEM" ? "AUTO" : "MANUAL",
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
    
        logWithContext("info", "[PaymentCancellation] Cancelled", {
            paymentUuid: payment.uuid,
            reason: input.reason,
            cancelledBy: input.cancelledBy,
        });
    
        return updated;
    }
}