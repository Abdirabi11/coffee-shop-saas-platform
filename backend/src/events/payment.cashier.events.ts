import prisma from "../../config/prisma.ts"
import { PaymentEventBus } from "../eventBus.ts";


PaymentEventBus.on("CASHIER_PAYMENT_COMPLETED", async (payload) => {
    const { paymentUuid, orderUuid, tenantUuid, storeUuid, amount, paymentMethod, processedBy } = payload;
  
    console.log(`[Event] Cashier payment completed: ${paymentUuid}`);
  
    // Update metrics
    await prisma.paymentMetrics.upsert({
        where: { storeUuid_date: { storeUuid, date: new Date() } },
        update: {
            totalPayments: { increment: 1 },
            totalAmount: { increment: amount },
            cashPayments: { increment: paymentMethod === "CASH" ? 1 : 0 },
            cardPayments: { increment: paymentMethod === "CARD_TERMINAL" ? 1 : 0 },
        },
        create: {
            tenantUuid,
            storeUuid,
            date: new Date(),
            totalPayments: 1,
            totalAmount: amount,
            cashPayments: paymentMethod === "CASH" ? 1 : 0,
            cardPayments: paymentMethod === "CARD_TERMINAL" ? 1 : 0,
        },
    });
  
    // Finalize order (move to COMPLETED)
    await prisma.order.update({
        where: { uuid: orderUuid },
        data: { status: "COMPLETED" },
    });
  
    // Send receipt
    // await ReceiptService.send(orderUuid);
});
  
PaymentEventBus.on("PAYMENT_VOIDED", async (payload) => {
    const { paymentUuid, orderUuid, voidedBy, voidReason } = payload;
  
    console.log(`[Event] Payment voided: ${paymentUuid} - ${voidReason}`);
  
    // Create admin alert for void
    const payment = await prisma.payment.findUnique({
        where: { uuid: paymentUuid },
    });
  
    if (payment) {
        await prisma.adminAlert.create({
            data: {
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            alertType: "PAYMENT_VOIDED",
            category: "FINANCIAL",
            level: "WARNING",
            priority: "MEDIUM",
            title: "Payment Voided",
            message: `Payment of ${payment.amount / 100} was voided: ${voidReason}`,
            context: {
                paymentUuid,
                orderUuid,
                voidedBy,
                voidReason,
            },
            },
        });
    }
});
  
PaymentEventBus.on("PAYMENT_CORRECTED", async (payload) => {
    const { paymentUuid, originalAmount, correctedAmount, correctedBy } = payload;
  
    console.log(`[Event] Payment corrected: ${paymentUuid}`);
  
    // Create audit log
    await prisma.adminAlert.create({
        data: {
            tenantUuid: payment.tenantUuid,
            storeUuid: payment.storeUuid,
            alertType: "PAYMENT_CORRECTED",
            category: "FINANCIAL",
            level: "INFO",
            priority: "LOW",
            title: "Payment Amount Corrected",
            message: `Payment amount changed from ${originalAmount / 100} to ${correctedAmount / 100}`,
            context: {
            paymentUuid,
            originalAmount,
            correctedAmount,
            correctedBy,
            },
        },
    });
});
  