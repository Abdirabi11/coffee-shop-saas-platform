import prisma from "../../config/prisma.ts"
import { PaymentCancellationService } from "../../services/payment/paymentCancellation.service.ts";

export class PaymentExpiryCleanupJob{
    static async run(){
        console.log("[PaymentExpiryCleanup] Starting...");

        // Find expired payments still in PENDING
        const expiredPayments = await prisma.payment.findMany({
            where: {
                paymentFlow: "PROVIDER",
                status: "PENDING",
                expiresAt: { lt: new Date() },
            },
            take: 50,
        });

        for (const payment of expiredPayments) {
            try {
                    await PaymentCancellationService.cancel({
                    paymentUuid: payment.uuid,
                    reason: "Payment intent expired",
                    cancelledBy: "SYSTEM",
                });

                // Release inventory
                await prisma.order.update({
                    where: { uuid: payment.orderUuid },
                    data: { 
                        status: "CANCELLED",
                        inventoryReleased: true,
                    },
                });
            } catch (error: any) {
                console.error(`[PaymentExpiryCleanup] Failed for ${payment.uuid}:`, error.message);
            }
        }
        console.log(`[PaymentExpiryCleanup] Cleaned up ${expiredPayments.length} expired payments`);
    }
}