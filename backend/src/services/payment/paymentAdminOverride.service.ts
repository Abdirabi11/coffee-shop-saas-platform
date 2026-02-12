import prisma from "../../config/prisma.ts"
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
            include: { order: true },
        });
      
        if (!payment) throw new Error("PAYMENT_NOT_FOUND");

        if (!input.reason || input.reason.trim().length < 10) {
            throw new Error("ADMIN_OVERRIDE_REQUIRES_DETAILED_REASON");
        };

        const updated= await prisma.$transaction(async (tx)=> {
            const updated= await tx.payment.update({
                where: { uuid: payment.uuid },
                data: {
                    status: input.targetState,
                    adminOverride: true,
                    adminOverrideReason: input.reason,
                    adminOverrideBy: input.adminUuid,
                    adminOverrideAt: new Date(),

                    //Update status-specific timestamps
                    ...(input.targetState === "PAID" && { paidAt: new Date() }),
                    ...(input.targetState === "FAILED" && { failedAt: new Date() }),
                },
            });

            await tx.paymentAuditSnapshot.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                    storeUuid: payment.storeUuid,
                    reason: "PAYMENT_ADMIN_OVERRIDE",
                    triggeredBy: input.adminUuid,
                    beforeStatus: payment.status,
                    afterStatus: input.targetState,
                    paymentState: updated,
                    orderState: payment.order,
                    metadata: {
                        adminUuid: input.adminUuid,
                        reason: input.reason,
                        originalStatus: payment.status,
                    },
                },
            });

            await tx.adminAlert.create({
                data: {
                    tenantUuid: payment.tenantUuid,
                    storeUuid: payment.storeUuid,
                    alertType: "PAYMENT_ADMIN_OVERRIDE",
                    category: "FINANCIAL",
                    level: "CRITICAL",
                    priority: "HIGH",
                    title: "Payment Admin Override",
                    message: `Payment ${payment.uuid} forced to ${input.targetState} by admin`,
                    context: {
                        paymentUuid: payment.uuid,
                        orderUuid: payment.orderUuid,
                        fromStatus: payment.status,
                        toStatus: input.targetState,
                        adminUuid: input.adminUuid,
                        reason: input.reason,
                    },
                },
            });
        
            return updated;
        })

        EventBus.emit("PAYMENT_ADMIN_OVERRIDDEN", {
            paymentUuid: payment.uuid,
            orderUuid: payment.orderUuid,
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            fromStatus: payment.status,
            toStatus: input.targetState,
            adminUuid: input.adminUuid,
            reason: input.reason,
        });
      
        console.log(`[PaymentAdminOverride] Force ${payment.status} → ${input.targetState} by ${input.adminUuid}`);
    
        return updated;
    }
};