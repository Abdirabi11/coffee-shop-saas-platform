import { InventoryReleaseService } from "../../services/order/inventoryRelease.service.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";
import { PaymentFraudEvaluator } from "../../services/payment/paymentFraudEvaluator.service.ts";
import prisma from "../../config/prisma.ts"
import { EmailService } from "../../services/email.service.ts";
import { PaymentEventBus } from "../eventBus.ts";

/**
 * Handle payment failure
 * This is the SINGLE source of truth for payment failure handling
 */
PaymentEventBus.on("PAYMENT_FAILED", async (payload) => {
    const { paymentUuid, orderUuid, tenantUuid, storeUuid, failureCode, failureReason } = payload;

    console.log(`[PaymentFailed] Processing: ${paymentUuid}`);
  
    try {
        // Update order status
        await OrderStatusService.transition(orderUuid, "PAYMENT_FAILED", {
            changedBy: "SYSTEM",
            reason: `Payment failed: ${failureReason}`,
        });
  
        await InventoryReleaseService.release(orderUuid);

        await PaymentFraudEvaluator.onPaymentFailed({
            paymentUuid,
            orderUuid,
            tenantUuid,
            storeUuid,
            failureCode,
            failureReason,
        });
  
      // 4. Send notification email
        const order = await prisma.order.findUnique({
            where: { uuid: orderUuid },
            include: {
                tenantUser: {
                    include: { user: true },
                },
            },
        });
  
        if (order?.tenantUser?.user?.email) {
            await EmailService.sendPaymentFailed(order.tenantUser.user.email, {
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                failureReason,
            });
        }
  
        //Create admin alert if fraud suspected
        if (failureCode === "FRAUD_SUSPECTED") {
            await prisma.adminAlert.create({
                data: {
                    tenantUuid,
                    storeUuid,
                    alertType: "FRAUD_SUSPECTED",
                    category: "SECURITY",
                    level: "CRITICAL",
                    priority: "HIGH",
                    title: "Fraud Suspected on Payment",
                    message: `Payment ${paymentUuid} flagged for potential fraud`,
                    context: {
                        paymentUuid,
                        orderUuid,
                        failureCode,
                    },
                },
            });
        }
  
        console.log(`[PaymentFailed] Successfully processed: ${paymentUuid}`);
    } catch (error: any) {
        console.error(`[PaymentFailed] Error processing ${paymentUuid}:`, error.message);
    }
});