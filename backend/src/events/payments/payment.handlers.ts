import { MetricsService } from "../../infrastructure/observability/metrics.ts";
import { FinalizeOrderJob } from "../../jobs/OrderJobs/finalizeOrder.job.ts";
import { EmailService } from "../../services/email.service.ts";
import { LedgerService } from "../../services/payment/ledger.service.ts";
import { PaymentFraudEvaluator } from "../../services/payment/paymentFraudEvaluator.service.ts";
import prisma from "../../config/prisma.ts"
import { PaymentEventBus } from "../eventBus.ts";

PaymentEventBus.on("PAYMENT_CONFIRMED", async (payload) => {
  const { paymentUuid, orderUuid, tenantUuid, storeUuid, amount } = payload;
  console.log(`[PaymentConfirmed] Processing: ${paymentUuid}`);

  //Record in ledger
  await LedgerService.record({
    tenantUuid,
    storeUuid,
    type: "PAYMENT",
    amount,
    currency: "USD",
    debitAccount: "CUSTOMER_PAYMENTS",
    creditAccount: "REVENUE",
    refType: "PAYMENT",
    refUuid: paymentUuid,
    description: `Payment received for order ${orderUuid}`,
  });

  await FinalizeOrderJob.run(orderUuid);

  //Send receipt
  const order = await prisma.order.findUnique({
    where: { uuid: orderUuid },
    include: {
      tenantUser: { include: { user: true } },
    },
  });

  if (order?.tenantUser?.user?.email) {
    await EmailService.sendPaymentReceipt(order.tenantUser.user.email, {
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      paymentMethod: order.payment?.paymentMethod,
    });
  };

  MetricsService.increment("revenue.total", amount, { storeUuid });

  //Fraud evaluation (positive signal)
  await PaymentFraudEvaluator.onPaymentSuccess({
    paymentUuid,
    orderUuid,
    tenantUuid,
    storeUuid,
    amount,
  });

  console.log(`[PaymentConfirmed] Successfully processed: ${paymentUuid}`);
});

PaymentEventBus.on("PAYMENT_REFUNDED", async (payload) => {
  const { paymentUuid, refundUuid, amount, tenantUuid, storeUuid } = payload;
  console.log(`[PaymentRefunded] Processing: ${refundUuid}`);

  // Record refund in ledger (reverse the payment)
  await LedgerService.record({
    tenantUuid,
    storeUuid,
    type: "REFUND",
    amount,
    currency: "USD",
    debitAccount: "REVENUE",
    creditAccount: "CUSTOMER_PAYMENTS",
    refType: "REFUND",
    refUuid: refundUuid,
    description: `Refund for payment ${paymentUuid}`,
  });

  // Fraud check
  await PaymentFraudEvaluator.onRefundCompleted({
    paymentUuid,
    refundUuid,
    amount,
    tenantUuid,
    storeUuid,
  });

  console.log(`[PaymentRefunded] Successfully processed: ${refundUuid}`);
});

PaymentEventBus.on("PAYMENT_TIMEOUT", async (payload) => {
  const { orderUuid, storeUuid, paymentUuid } = payload;

  console.log(`[PaymentTimeout] Order ${orderUuid} timed out`);

  MetricsService.increment("checkout.timeout", 1, { storeUuid });
  await PaymentFraudEvaluator.detectFailureVelocity(payload);
});