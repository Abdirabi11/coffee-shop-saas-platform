import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.js";

export class PaymentReconciliationJob{
    static async run(){
        const stuckPayments = await prisma.payment.findMany({
            where: { status: "PAID", providerRef: null },
        });

        for (const payment of stuckPayments) {
            const providerState = await PaymentProviderAdapter.lookup(payment);

            if(providerState.status === "PAID"){
                await prisma.payment.update({
                    where: { uuid: payment.uuid},
                    data: {
                        providerRef: providerState.providerRef,
                        snapshot: providerState.snapshot,
                    }
                });

                EventBus.emit("PAYMENT_RECONCILED", {
                    paymentUuid: payment.uuid,
                    orderUuid: payment.orderUuid,
                });
            };

            if (providerState.status === "FAILED") {
                await prisma.payment.update({
                  where: { uuid: payment.uuid },
                  data: { status: "FAILED" },
                });
            };
        }
    }
}