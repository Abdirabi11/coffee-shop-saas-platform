import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metrics.ts";
import { PaymentProviderAdapter } from "../../payment/providers/payment-provider.adapter.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { OrderStatusService } from "../order/order-status.service.ts";
import { assertTransition, PaymentIntentService } from "./payment-intent.service.ts";
import { PaymentRiskScoreService } from "./paymentRiskScore.service.ts";

const paymentSnapshot = {
  amount: 750,
  currency: "USD",
  provider: "stripe",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  chargedAt: new Date().toISOString(),
};

export class PaymentService{
  static async startPayment(orderUuid: string, provider: string, userUuid: string){
    const order= await prisma.order.findUnique({
      where: {uuid: orderUuid},
      include: {store: true}
    });

    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.status !== "PAYMENT_PENDING") {
      throw new Error("INVALID_ORDER_STATE");
    };

    const existing= await prisma.order.findFirst({
      where: {
        orderUuid,
      }
    });

    if (existing) {
      throw new Error("PAYMENT_ALREADY_IN_PROGRESS");
    };

    const risk = await PaymentRiskScoreService.get(userUuid);
    if (risk >= 80) {
      throw new Error("PAYMENT_REQUIRES_MANUAL_REVIEW");
    }

    //  SERVER-SIDE OFFLINE ENFORCEMENT
    if (order.store.isOffline && provider !== "WALLET") {
      throw new Error("PAYMENT_DISABLED_OFFLINE");
    };

    await RiskPolicyEnforcer.apply()

    await PaymentIntentService.lock(orderUuid);

    const intent= await PaymentProviderAdapter.createPaymentIntent({
      provider,
      amount: order.totalAmount,
      currency: order.currency,
      metadata: { orderUuid },
    });
        
    return intent;
  }

  //webhook driven confirmation 
  static async confirmFromProviderEvent(input: {
    orderUuid: string,
    provider: string,
    providerRef: string,
    snapshot: any,
  }){
    const order= await prisma.order.findUnique({
      where: { uuid: input.orderUuid },
      include: {
        payment: true,
        paymentIntent: true
      }
    })

    if (!order) throw new Error("Order not found");

    if (order.payment?.providerRef === input.providerRef) {
      return order.payment;
    };

    if (!order.paymentIntent) {
      throw new Error("PAYMENT_INTENT_NOT_FOUND");
    }

    if (order.status !== "PAYMENT_PENDING") {
      throw new Error("INVALID_ORDER_STATE");
    };

    if (order.paymentIntent.status !== "LOCKED") {
      throw new Error("PAYMENT_NOT_LOCKED");
    }

    assertTransition(order.paymentIntent.status, "PAID");

    await prisma.$transaction(async (tx)=> {
      await tx.payment.create({
        data:{
          orderUuid: order.uuid,
          storeUuid: order.storeUuid,
          amount: order.totalAmount,
          currency: order.currency,
          provider: input.provider,
          providerRef: input.providerRef,
          status: "PAID",
          snapshot: input.snapshot,
        }
      });

      await tx.paymentIntent.update({
        where: { orderUuid: order.uuid},
        data: { status: "PAID", locketAt: null}
      })

      await tx.paymentSnapshot.update({
        where: { orderUuid: order.uuid },
        data: { status: "PAID" },
      });

      await OrderStatusService.transition(tx, order.uuid, "PAID");
    })

    EventBus.emit("PAYMENT_CONFIRMED", {
      orderUuid: order.uuid,
      storeUuid: order.storeUuid,
      amount: order.totalAmount,
    });
  }

  //ACTIVE PROVIDER CONFIRMATION
  static async confirmByPolling(paymentUuid: string) {
    const start = Date.now();
    const payment = await prisma.payment.findUnique({
      where: { uuid: paymentUuid },
    });

    if (!payment) throw new Error("PAYMENT_NOT_FOUND");

    const provider = PaymentProviderAdapter.get(
      payment.provider
    );

    try {
      const result = await provider.confirm( payment.providerRef );

      MetricsService.timing(
        "payment.provider.latency",
        Date.now() - start,
        { provider: payment.provider }
      );

      logWithContext("info", "Payment confirmed", {
        traceUuid,
        paymentUuid: payment.uuid,
        orderUuid: payment.orderUuid,
        provider: payment.provider,
        providerRef: payment.providerRef,
      });

      PaymentStateMachine.assertTransition(
        payment.status,
        "PAID"
      );

      await prisma.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "PAID",
          snapshot: result.snapshot,
        },
      });

      EventBus.emit("PAYMENT_SUCCEEDED", {
        paymentUuid,
      });
    } catch (err: any) {
      const provider = PaymentProviderAdapter.get(
        payment.provider
      );

      const failureCode = provider.normalizeError(err);

      MetricsService.increment(
        `payment.provider.error.${failureCode}`,
        1,
        { provider: payment.provider }
      );
    
      logWithContext("error", "Payment provider error", {
        traceUuid,
        paymentUuid: payment.uuid,
        provider: payment.provider,
        failureCode,
      });

      await prisma.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "FAILED",
          failureCode, // ✅ THIS is where it’s stored
        },
      });

      EventBus.emit("PAYMENT_FAILED", {
        paymentUuid,
        failureCode,
      });

      throw err;
    }
  }

  static async markPaid(paymentUuid: string){
    const payment= await prisma.payment.findUnique({
      where: {uuid: paymentUuid}
    });

    if (!payment) throw new Error("PAYMENT_NOT_FOUND");

    PaymentStateMachine.assertTransition(
      payment.status,
      "PAID"
    );

    await prisma.payment.update({
      where: { uuid: paymentUuid },
      data: {
        status: "PAID",
        lockedAt: null,
        paidAt: new Date(),
      },
    });
  }

  static async unlockPayment(paymentUuid: string) {
    await prisma.payment.update({
      where: { uuid: paymentUuid },
      data: {
        lockedAt: null,
      },
    });
  }

  static async retryFailedPayment(){
    MetricsService.increment(
      "payment.retry.attempt",
      1,
      {
        provider: payment.provider,
      }
    );
    
    logWithContext("warn", "Retrying failed payment", {
      traceUuid,
      paymentUuid,
      retryCount: payment.retryCount + 1,
    });
  }
};