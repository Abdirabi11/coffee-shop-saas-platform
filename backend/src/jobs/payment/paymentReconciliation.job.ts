import prisma from "../../config/prisma.ts"
import { EventBus } from "../../events/eventBus.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";

export class PaymentReconciliationJob{
    static async run(){
        const stuckPayments = await prisma.payment.findMany({
            where:{
                OR:[
                    { status: "PAID", providerRef: null },
                    { status: "FAILED" },
                ],
            },
            take: 20,
        });

        for (const payment of stuckPayments) {
            const providerState = await PaymentProviderAdapter.lookup(payment);

            if (providerState.status === "PAID" && payment.status !== "PAID") {
                await prisma.$transaction(async tx => {
                  await tx.payment.update({
                    where: { uuid: payment.uuid },
                    data: {
                      status: "PAID",
                      providerRef: providerState.providerRef,
                      snapshot: providerState.snapshot,
                    },
                  });
        
                await OrderStatusService.transition(
                    tx,
                    payment.orderUuid,
                    "PAID"
                  );
                });
        
                EventBus.emit("PAYMENT_RECONCILED", {
                  paymentUuid: payment.uuid,
                  orderUuid: payment.orderUuid,
                  storeUuid: payment.storeUuid,
                });
            }
        

            if (providerState.status === "FAILED" && payment.status !== "FAILED") {
                await prisma.payment.update({
                  where: { uuid: payment.uuid },
                  data: { status: "FAILED" },
                });
            };
        }
    }
};