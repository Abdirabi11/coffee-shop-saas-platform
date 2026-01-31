import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";

export class PaymentIntentService{
  //locking payment when confirming process starts
  static async lock(orderUuid: string){
    const intent = await prisma.paymentIntent.findUnique({
      where: { orderUuid },
    });
    if (intent){
      assertTransition(intent.status, "LOCKED");

      if (intent?.lockedAt) {
        throw new Error("PAYMENT_IN_PROGRESS");
      };

      await prisma.paymentIntent.upsert({
        where: { orderUuid },
        update: { lockedAt: new Date(), status: "LOCKED" },
        create: {
          orderUuid,
          lockedAt: new Date(),
          status: "LOCKED",
        },
      });
      return;
    };

    await prisma.paymentIntent.create({
      data: {
        orderUuid,
        status: "LOCKED",
        lockedAt: new Date()
      }
    })
  }  

  static async fail(orderUuid: string){
    const intent = await prisma.paymentIntent.findUnique({
      where: { orderUuid },
    });

    if (!intent) return;

    assertTransition(intent.status, "FAILED");

    await prisma.paymentIntent.update({
      where: { orderUuid },
      data: { status: "FAILED", lockedAt: null },
    });
  }

  static async retry(paymentUuid: string){
    const payment= await prisma.payment.findFirst({
      where: { uuid: paymentUuid }
    });

    if (!payment) throw new Error("NO_FAILED_PAYMENT_FOUND");

    if (
      payment.lastRetryAt &&
      Date.now() - payment.lastRetryAt.getTime() <
        5 * 60 * 1000
    ) {
      throw new Error("RETRY_COOLDOWN_ACTIVE");
    }

    if (payment.failureCode === "FRAUD_SUSPECTED") throw new Error("PERMANENT_FAILURE");
  
    PaymentStateMachine.assertTransition(
      payment.status,
      "RETRYING"
    );

    await prisma.payment.update({
      where: { uuid: payment.uuid },
      data: {
        status: "RETRYING",
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
        lockedAt: new Date(),
      },
    });

    EventBus.emit("PAYMENT_RETRY_STARTED", {
      paymentUuid
    });
  }
};

const ALLOWED_TRANSITIONS = {
  CREATED: ["LOCKED"],
  LOCKED: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
};
  
export function assertTransition(from: string, to: string) {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`INVALID_PAYMENT_TRANSITION ${from} → ${to}`);
    }
};