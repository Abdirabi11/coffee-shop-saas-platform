import { EventBus } from "./eventBus.js";
import prisma from "../config/prisma.ts"
import { LedgerService } from "../services/payment/ledger.service.js";

EventBus.on(
    "PAYMENT_SUCCEEDED",
    async ({ paymentUuid }) => {
      const payment =
        await prisma.payment.findUnique({
          where: { uuid: paymentUuid },
        });
  
      if (!payment) return;
  
      await LedgerService.record({
        type: "CREDIT",
        amount: payment.amount,
        currency: payment.currency,
        walletUuid: payment.merchantWalletUuid,
        refType: "PAYMENT",
        refUuid: payment.uuid,
      });
    }
  );
  
EventBus.on( "PAYMENT_REFUNDED",
    async ({ paymentUuid }) => {
      const payment = await prisma.payment.findUnique({ where: { uuid: paymentUuid },});
  
      if (!payment) return;
  
      await LedgerService.record({
        type: "DEBIT",
        amount: payment.amount,
        currency: payment.currency,
        walletUuid: payment.merchantWalletUuid,
        refType: "REFUND",
        refUuid: payment.uuid,
      });
    }
);
  