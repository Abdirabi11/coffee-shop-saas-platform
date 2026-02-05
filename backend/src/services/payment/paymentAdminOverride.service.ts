import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payments/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";


export class PaymentAdminOverrideService {
    static async forceState(input: {
        paymentUuid: string;
        targetState: "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
        adminUuid: string;
        reason: string;
    }){
        const payment = await prisma.payment.findUnique({
            where: { uuid: input.paymentUuid },
        });
      
        if (!payment) throw new Error("PAYMENT_NOT_FOUND");

        PaymentStateMachine.assertTransition(
            payment.status,
            input.targetState
        );

        PaymentAdminOverrideService.forceState(...)

        await prisma.$transaction(async (tx)=> {
            await tx.payment.update({
                where: { uuid: payment.uuid },
                data: {
                  status: input.targetState,
                  adminOverride: true,
                  adminOverrideReason: input.reason,
                },
            });

            await tx.auditLog.create({
                data: {
                  action: "PAYMENT_ADMIN_OVERRIDE",
                  entityUuid: payment.uuid,
                  performedBy: input.adminUuid,
                  metadata: {
                    from: payment.status,
                    to: input.targetState,
                    reason: input.reason,
                  },
                },
            });

        })

        EventBus.emit("PAYMENT_ADMIN_OVERRIDDEN", {
            paymentUuid: payment.uuid,
            targetState: input.targetState,
            adminUuid: input.adminUuid,
        });
    }
};