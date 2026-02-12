import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { InventoryReleaseService } from "../../services/order/inventoryRelease.service.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";
import { PaymentCancellationService } from "../../services/payment/paymentCancellation.service.ts";

const PAYMENT_TIMEOUT_MINUTES = 15;
const BATCH_SIZE = 20;

export class PaymentTimeoutJob{
    static async run(){
        const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
        console.log(`[PaymentTimeoutJob] Checking for payments pending since ${cutoff.toISOString()}`);

        const expiredOrders= await prisma.order.findMany({
            where: {
                status: "PAYMENT_PENDING",
                paymentFlow: "PROVIDER",
                createdAt: { lt: cutoff}
            },
            take: BATCH_SIZE,
            include: {
                payment: true,
            },
        });

        if (expiredOrders.length === 0) {
            console.log("[PaymentTimeoutJob] No expired orders found");
            return;
        }
    
        console.log(`[PaymentTimeoutJob] Found ${expiredOrders.length} expired orders`);
  
        let cancelled = 0;
        let failed = 0;

        for (const order of expiredOrders) {
            try {
                await prisma.$transaction(async (tx) => {
                    await OrderStatusService.transition(tx, order.uuid, "CANCELLED", {
                        changedBy: "SYSTEM",
                        reason: "Payment timeout - no payment received within 15 minutes",
                    });
      
                    await InventoryReleaseService.release(tx, order.uuid);
      
                    // Mark payment as failed if exists
                    if (order.payment) {
                        await tx.payment.update({
                            where: { uuid: order.payment.uuid },
                            data: {
                                status: "FAILED",
                                failureCode: "PROVIDER_TIMEOUT",
                                failureReason: "Payment intent expired",
                                failedAt: new Date(),
                            },
                        });
                    }
                });
      
                PaymentEventBus.emit("PAYMENT_TIMEOUT", {
                    orderUuid: order.uuid,
                    tenantUuid: order.tenantUuid,
                    storeUuid: order.storeUuid,
                    paymentUuid: order.payment?.uuid,
                });
      
                cancelled++;
            } catch (error: any) {
                console.error(`[PaymentTimeoutJob] Failed to cancel order ${order.uuid}:`, error.message);
                failed++;
            }
        };
      
        console.log(`[PaymentTimeoutJob] Completed: ${cancelled} cancelled, ${failed} failed`);
    }
};