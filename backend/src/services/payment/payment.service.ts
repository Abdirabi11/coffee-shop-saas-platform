import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/paymentStateMachine.ts";
import { PaymentEventBus } from "../../events/eventBus.js";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metrics.ts";
import { PaymentProviderAdapter } from "../../payment/providers/payment-provider.adapter.ts";
import { AccountService } from "../account/account.service.js";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
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
  static async startPayment(input: {  
    orderUuid: string;
    provider: "STRIPE" | "WALLET" | "EVC_PLUS";
    tenantUserUuid: string;
  }) {
    const traceUuid = `pay_${Date.now()}`;

    //get order
    const order= await prisma.order.findUnique({
      where: {uuid: input.orderUuid},
      include: {
        store: true,
        tenantUser: { include: { user: true } },
        payment: true,
      }
    });

    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.status !== "PAYMENT_PENDING") {
      throw new Error("INVALID_ORDER_STATE");
    };

    //Check if payment already exists
    if (order.payment) {
      if (order.payment.status === "PENDING" && order.payment.expiresAt && order.payment.expiresAt > new Date()) {
        return {
          paymentUuid: order.payment.uuid,
          clientSecret: order.payment.clientSecret,
          providerRef: order.payment.providerRef,
        };
      }
      
      throw new Error("PAYMENT_ALREADY_EXISTS");
    };

    const userUuid = order.tenantUser.userUuid;
    const riskScore = await PaymentRiskScoreService.get(order.tenantUuid, userUuid);

    if (riskScore >= 80) {
      throw new Error("PAYMENT_REQUIRES_MANUAL_REVIEW");
    };

    //Offline enforcement (if store is offline, only wallet allowed)
    if (order.store.isOffline && input.provider !== "WALLET") {
      throw new Error("PAYMENT_DISABLED_OFFLINE");
    };

    await RiskPolicyEnforcer.apply(input.tenantUserUuid);
    
    // Check if locked
    if (await AccountService.isPaymentLocked(input.tenantUserUuid)) {
      throw new Error("PAYMENT_LOCKED_BY_RISK_POLICY");
    }

    //Create payment intent with provider
    const intent = await PaymentProviderAdapter.createPaymentIntent({
      provider: input.provider,
      amount: order.totalAmount,
      currency: order.currency,
      metadata: {
        orderUuid: order.uuid,
        tenantUuid: order.tenantUuid,
        storeUuid: order.storeUuid,
      },
    });

    //Create payment record in database
    const payment = await prisma.payment.create({
      data: {
        orderUuid: order.uuid,
        tenantUuid: order.tenantUuid,
        storeUuid: order.storeUuid,
        
        // Amounts
        amount: order.totalAmount,
        currency: order.currency,
        subtotal: order.subtotal,
        tax: order.taxAmount,
        discount: order.discountAmount,
        
        // Provider details
        paymentFlow: "PROVIDER",
        paymentMethod: input.provider,
        provider: input.provider,
        providerRef: intent.providerRef,
        clientSecret: intent.clientSecret,
        
        status: "PENDING",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        snapshot: intent.snapshot || {},
        orderSnapshot: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
        },
        pricingRules: {
          subtotal: order.subtotal,
          tax: order.taxAmount,
          discount: order.discountAmount,
        },
      },
    });

    logWithContext("info", "Payment started", {
      traceUuid,
      paymentUuid: payment.uuid,
      orderUuid: order.uuid,
      provider: input.provider,
      amount: order.totalAmount,
    });

    MetricsService.increment("payment.started", 1, {
      provider: input.provider,
    });

    return {
      paymentUuid: payment.uuid,
      providerRef: payment.providerRef,
      clientSecret: payment.clientSecret,
      expiresAt: payment.expiresAt,
    };
  }

  //webhook driven confirmation 
  static async confirmFromProviderEvent(input: {
    paymentUuid: string;
    providerRef: string;
    snapshot: any;
  }){
    const payment = await prisma.payment.findUnique({
      where: { uuid: input.paymentUuid },
      include: { order: true },
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    };

    if (payment.status === "PAID") {
      logWithContext("info", "Payment already confirmed", {
        paymentUuid: payment.uuid,
        orderUuid: payment.orderUuid,
      });
      return payment;
    };

    PaymentStateMachine.assertTransition(payment.status, "PAID");

    // Update payment and order
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "PAID",
          paidAt: new Date(),
          snapshot: input.snapshot,
        },
      });

      await tx.order.update({
        where: { uuid: payment.orderUuid },
        data: {
          status: "PAID",
          paymentStatus: "COMPLETED",
        },
      });

      await tx.paymentAuditSnapshot.create({
        data: {
          tenantUuid: payment.tenantUuid,
          paymentUuid: payment.uuid,
          orderUuid: payment.orderUuid,
          storeUuid: payment.storeUuid,
          reason: "PAYMENT_CONFIRMED",
          triggeredBy: "SYSTEM",
          beforeStatus: payment.status,
          afterStatus: "PAID",
          paymentState: updated,
          orderState: payment.order,
          metadata: {
            provider: payment.provider,
            providerRef: input.providerRef,
          },
        },
      });

      return updated;
    });

    // Emit event
    PaymentEventBus.emit("PAYMENT_CONFIRMED", {
      paymentUuid: updated.uuid,
      orderUuid: payment.orderUuid,
      tenantUuid: payment.tenantUuid,
      storeUuid: payment.storeUuid,
      amount: payment.amount,
    });

    logWithContext("info", "Payment confirmed from webhook", {
      paymentUuid: updated.uuid,
      orderUuid: payment.orderUuid,
    });

    MetricsService.increment("payment.confirmed", 1, {
      provider: payment.provider,
      method: "webhook",
    });

    return updated;
  }

  // Mark payment as failed from provider
  static async markFailedFromProvider(input: {
    paymentUuid: string;
    failureCode: string;
    failureReason?: string;
    snapshot: any;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { uuid: input.paymentUuid },
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    // Validate transition
    PaymentStateMachine.assertTransition(payment.status, "FAILED");

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "FAILED",
          failureCode: input.failureCode,
          failureReason: input.failureReason,
          failedAt: new Date(),
          snapshot: input.snapshot,
        },
      });

      await tx.order.update({
        where: { uuid: payment.orderUuid },
        data: {
          status: "PAYMENT_FAILED",
          paymentStatus: "FAILED",
        },
      });

      return updated;
    });

    PaymentEventBus.emit("PAYMENT_FAILED", {
      paymentUuid: updated.uuid,
      orderUuid: payment.orderUuid,
      tenantUuid: payment.tenantUuid,
      storeUuid: payment.storeUuid,
      failureCode: input.failureCode,
      failureReason: input.failureReason,
    });

    logWithContext("warn", "Payment failed", {
      paymentUuid: updated.uuid,
      orderUuid: payment.orderUuid,
      failureCode: input.failureCode,
    });

    MetricsService.increment("payment.failed", 1, {
      provider: payment.provider,
      failureCode: input.failureCode,
    });

    return updated;
  }

  //ACTIVE PROVIDER CONFIRMATION
  static async confirmByPolling(paymentUuid: string) {
    const start = Date.now();
    const payment = await prisma.payment.findUnique({
      where: { uuid: paymentUuid },
    });

    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (!payment.providerRef) {
      throw new Error("MISSING_PROVIDER_REF");
    };

    try {
      // Query provider
      const result = await PaymentProviderAdapter.lookup(payment);

      MetricsService.timing(
        "payment.provider.latency",
        Date.now() - start,
        { provider: payment.provider }
      );

      // Handle based on provider status
      if (result.status === "PAID") {
        return this.confirmFromProviderEvent({
          paymentUuid: payment.uuid,
          providerRef: payment.providerRef,
          snapshot: result.snapshot,
        });
      } else if (result.status === "FAILED") {
        return this.markFailedFromProvider({
          paymentUuid: payment.uuid,
          failureCode: "PROVIDER_DECLINED",
          failureReason: "Payment declined by provider",
          snapshot: result.snapshot,
        });
      };

      return payment;
    } catch (error: any) {
      logWithContext("error", "Payment polling failed", {
        paymentUuid: payment.uuid,
        provider: payment.provider,
        error: error.message,
      });

      throw error;
    };
  }

  static async retryFailedPayment(paymentUuid: string){
    const payment = await prisma.payment.findUnique({
      where: { uuid: paymentUuid },
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    if (payment.retries >= payment.maxRetries) {
      throw new Error("MAX_RETRIES_EXCEEDED");
    }

    // Validate transition
    PaymentStateMachine.assertTransition(payment.status, "RETRYING");

    const updated = await prisma.payment.update({
      where: { uuid: paymentUuid },
      data: {
        status: "RETRYING",
        retries: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });

    MetricsService.increment("payment.retry.attempt", 1, {
      provider: payment.provider,
    });

    logWithContext("warn", "Retrying failed payment", {
      paymentUuid,
      retryCount: updated.retries,
    });

    // Attempt to confirm by polling
    try {
      return await this.confirmByPolling(paymentUuid);
    } catch (error: any) {
      logWithContext("error", "Payment retry failed", {
        paymentUuid,
        error: error.message,
      });

      if (updated.retries >= updated.maxRetries) {
        // Mark as permanently failed
        await this.markFailedFromProvider({
          paymentUuid,
          failureCode: "MAX_RETRIES_EXCEEDED",
          failureReason: "Payment failed after maximum retries",
          snapshot: {},
        });
      }

      throw error;
    };
  }

  static async cancelFromProvider(input: {
    paymentUuid: string;
    snapshot: any;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { uuid: input.paymentUuid },
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    PaymentStateMachine.assertTransition(payment.status, "CANCELLED");

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "CANCELLED",
          snapshot: input.snapshot,
        },
      });

      await tx.order.update({
        where: { uuid: payment.orderUuid },
        data: {
          status: "CANCELLED",
          paymentStatus: "CANCELLED",
        },
      });

      return updated;
    });

    PaymentEventBus.emit("PAYMENT_CANCELLED", {
      paymentUuid: updated.uuid,
      orderUuid: payment.orderUuid,
    });

    return updated;
  }
};