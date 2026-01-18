import prisma from "../config/prisma.ts"
import { PaymentService } from "../../services/payment/payment.service.ts";
import { OrderEventBus } from "../../events/order.events.ts";

const MAX_RETRIES = 3;

export class PaymentRetryJob{
    static async run(){
        const failedPayemnts= await prisma.payment.findMany({
            where: {
                status: "FAILED",
                retries: { lt: MAX_RETRIES },
            }
        });

        for(const payment of failedPayemnts){
            try {
                await PaymentService.retry(payment.uuid);
            } catch{
                const updated = await prisma.payment.update({
                    where: { uuid: payment.uuid },
                    data: { retries: { increment: 1 } },
                });

                if (updated.retries >= MAX_RETRIES) {
                    OrderEventBus.emit("PAYMENT_FAILED_FINAL", {
                      orderUuid: payment.orderUuid,
                    });
                }
            }
        }
    }
};