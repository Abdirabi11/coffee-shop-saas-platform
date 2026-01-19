import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";

const MAX_RETRIES = 3;

export class FailedPaymentRetryJob{
    static async run(){
        const failedPayments= await prisma.payment.findMany({
            where: {
                status: "FAILED",
                retries: { lt: MAX_RETRIES },
            }
        });

        for (const payment of failedPayments) {
            try {
                const result= await PaymentProviderAdapter.retry(payment);

                if(result.success){
                    await PaymentService.confirmPayment({
                        orderUuid: payment.orderUuid,
                        provider: payment.provider,
                        providerRef: result.providerRef,
                        snapshot: result.snapshot,
                    });
                }else{
                    await prisma.payment.update({
                        where: {uuid: payment.uuid},
                        data: {retries: { increment: 1}}
                    })
                }
            } catch (error) {
                await prisma.payment.update({
                    where: { uuid: payment.uuid },
                    data: { retries: { increment: 1 } },
                  });
          
                if (payment.retries + 1 >= MAX_RETRIES) {
                    EventBus.emit("PAYMENT_RETRY_EXHAUSTED", {
                      paymentUuid: payment.uuid,
                      orderUuid: payment.orderUuid,
                    });
                }
            }
        };
    }
};