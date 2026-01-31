import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/payment-provider.adapter.ts";
import { OrderStatusService } from "../../services/order/order-status.service.ts";

export class PaymentReconciliationJob{
  static async run(){
    const stuckPayments = await prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      take: 20,
    });

    for (const payment of stuckPayments) {
      const providerState = await PaymentProviderAdapter.lookup(payment);

      if (providerState.status === "PAID" && payment.status !== "PAID") {
        PaymentStateMachine.assertTransition(
          payment.status,
          "PAID"
        );

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
        });
      }
    
      if (providerState.status === "FAILED" && payment.status !== "FAILED") {
        PaymentStateMachine.assertTransition(
          payment.status,
          "FAILED"
        );

        await prisma.payment.update({
          where: { uuid: payment.uuid },
          data: { status: "FAILED" },
        });

        // EventBus.emit("PAYMENT_FAILED", {
        //   orderUuid: payment.orderUuid,
        //   storeUuid: payment.storeUuid,
        //   reason: "RECONCILIATION_MISMATCH",
        // });
      };
    }
  }
};