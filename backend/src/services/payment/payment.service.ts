import { Prisma, type OrderStatus } from "@prisma/client";
import prisma from "../../config/prisma.ts"
import { PaymentStateMachine } from "../../domain/payment/PaymentStateMachine.ts";
import { EventBus } from "../../events/eventBus.ts";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { PaymentProviderAdapter } from "../../infrastructure/payments/providers/paymentProvider.adapter.ts";
import { hitRateLimitWindow } from "../../lib/rateLimitWindow.ts";
import { AccountService } from "../account/account.service.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { OrderStatusService } from "../order/OrderStatus.service.ts";
import { RefundService } from "./Refund.service.ts";
import { PaymentRateLimitService } from "./paymentRateLimit.service.ts";
import { PaymentRiskScoreService } from "./paymentRiskScore.service.ts";

const PAYMENT_TTL_MS = 15 * 60 * 1000;

// While a request is talking to the provider for a placeholder payment it
// holds this lease (stored in lastRetryAt) so a concurrent request can't call
// the provider for the same payment at the same time.
const PROVIDER_ATTEMPT_LEASE_MS = 30 * 1000;

// At most one provider status lookup per payment per window; extra polls get
// the stored status.
const STATUS_POLL_WINDOW_MS = 5 * 1000;

const ACTIVE_STATUSES = new Set(["PENDING", "RETRYING", "PROCESSING", "AUTHORIZED"]);

export type ConfirmOutcome =
  | "CONFIRMED"          // payment PAID, order PAID
  | "ALREADY_PAID"       // idempotent replay, nothing changed
  | "AMOUNT_MISMATCH"    // provider amount/currency differ; flagged, not PAID
  | "ORDER_NOT_PAYABLE"  // funds captured but order can't be paid; auto-refund requested
  | "PAYMENT_TERMINAL";  // funds captured on a closed payment; flagged for manual action

export class PaymentService{
  //Start (or resume) a provider payment for an order.
  //
  // Double-charge protection: the Payment row is inserted BEFORE the provider
  // is called. Payment.orderUuid is unique, so only one request per order can
  // create it; the provider call is made with an idempotency key derived from
  // that row, so a retry after a timeout gets the same intent back instead of
  // a second charge.
  static async startPayment(input: {
    tenantUuid: string;      // req.tenant.uuid
    tenantUserUuid: string;  // req.tenantUser.uuid
    orderUuid: string;
    provider: "STRIPE" | "WALLET" | "EVC_PLUS";
  }) {
    const traceUuid = `pay_${Date.now()}`;

    const order = await prisma.order.findFirst({
      where: { uuid: input.orderUuid, tenantUuid: input.tenantUuid },
      include: {
        store: true,
        tenantUser: { include: { user: true } },
        // Payment.orderUuid is unique, so there is at most one
        payments: true,
      },
    });

    // Customer-facing flow: only the order's owner may pay for it (and see
    // its clientSecret). Not-found and not-yours look the same.
    if (!order || order.tenantUserUuid !== input.tenantUserUuid) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const [existingPayment] = order.payments;
    if (existingPayment) {
      return this.resumeExistingPayment(existingPayment, order);
    }

    if (!OrderStatusService.canTransition(order.status, "PAID")) {
      throw new Error("ORDER_NOT_PAYABLE");
    }

    const riskScore = await PaymentRiskScoreService.get(
      order.tenantUuid,
      input.tenantUserUuid
    );

    if (riskScore >= 80) {
      throw new Error("PAYMENT_REQUIRES_MANUAL_REVIEW");
    }

    // TODO(schema): offline-store enforcement ("only WALLET while the store
    // is offline") read order.store.isOffline, which doesn't exist on Store,
    // so it never fired. Restore once the column exists.

    await RiskPolicyEnforcer.apply(input.tenantUserUuid);

    if (await AccountService.isPaymentLocked(input.tenantUserUuid)) {
      throw new Error("PAYMENT_LOCKED_BY_RISK_POLICY");
    }

    await PaymentRateLimitService.checkLimit({
      tenantUserUuid: input.tenantUserUuid,
      amount: order.totalAmount,
    });

    // Placeholder first: claims the order and holds the provider lease
    let payment;
    try {
      payment = await prisma.payment.create({
        data: {
          orderUuid: order.uuid,
          tenantUuid: order.tenantUuid,
          storeUuid: order.storeUuid,

          amount: order.totalAmount,
          currency: order.currency,
          subtotal: order.subtotal,
          tax: order.taxAmount,
          discount: order.discountAmount,

          paymentFlow: "PROVIDER",
          paymentMethod: input.provider,
          provider: input.provider,

          status: "PENDING",
          expiresAt: new Date(Date.now() + PAYMENT_TTL_MS),
          lastRetryAt: new Date(), // provider-attempt lease
          snapshot: {},
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A concurrent request created it first
        const existing = await prisma.payment.findUnique({ where: { orderUuid: order.uuid } });
        if (existing) return this.resumeExistingPayment(existing, order);
      }
      throw error;
    }

    logWithContext("info", "[Payment] Placeholder created", {
      traceUuid,
      paymentUuid: payment.uuid,
      orderUuid: order.uuid,
      provider: input.provider,
      amount: order.totalAmount,
    });

    return this.attachProviderIntent(payment, order);
  }

  // A payment row already exists for this order
  private static async resumeExistingPayment(
    payment: Prisma.PaymentGetPayload<{}>,
    order: Prisma.OrderGetPayload<{ include: { tenantUser: { include: { user: true } } } }>
  ) {
    if (payment.status !== "PENDING") {
      throw new Error("PAYMENT_ALREADY_EXISTS");
    }

    if (payment.providerRef) {
      if (payment.expiresAt && payment.expiresAt <= new Date()) {
        throw new Error("PAYMENT_EXPIRED");
      }
      return {
        paymentUuid: payment.uuid,
        providerRef: payment.providerRef,
        clientSecret: payment.clientSecret,
        expiresAt: payment.expiresAt,
      };
    }

    // Placeholder whose provider call never completed (crash/timeout).
    // Take the lease atomically; the idempotency key makes re-calling the
    // provider return the original intent if one was created.
    const lease = await prisma.payment.updateMany({
      where: {
        uuid: payment.uuid,
        status: "PENDING",
        providerRef: null,
        OR: [
          { lastRetryAt: null },
          { lastRetryAt: { lt: new Date(Date.now() - PROVIDER_ATTEMPT_LEASE_MS) } },
        ],
      },
      data: { lastRetryAt: new Date() },
    });

    if (lease.count === 0) {
      throw new Error("PAYMENT_IN_PROGRESS");
    }

    return this.attachProviderIntent(payment, order);
  }

  private static async attachProviderIntent(
    payment: Prisma.PaymentGetPayload<{}>,
    order: Prisma.OrderGetPayload<{ include: { tenantUser: { include: { user: true } } } }>
  ) {
    let intent;
    try {
      intent = await PaymentProviderAdapter.createPaymentIntent({
        provider: payment.provider!,
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey: `payment-intent-${payment.uuid}`,
        metadata: {
          paymentUuid: payment.uuid,
          orderUuid: order.uuid,
          tenantUuid: order.tenantUuid,
          storeUuid: order.storeUuid,
          customerPhone: order.tenantUser.user.phoneNumber,
        },
      });
    } catch (error: any) {
      // Keep the placeholder (the provider may have created the intent before
      // failing) and release the lease so the next attempt resumes with the
      // same idempotency key.
      await prisma.payment.update({
        where: { uuid: payment.uuid },
        data: { lastError: error.message, lastRetryAt: null },
      });
      throw error;
    }

    const updated = await prisma.payment.update({
      where: { uuid: payment.uuid },
      data: {
        providerRef: intent.providerRef,
        clientSecret: intent.clientSecret,
        snapshot: intent.snapshot || {},
        lastError: null,
      },
    });

    logWithContext("info", "[Payment] Started", {
      paymentUuid: updated.uuid,
      orderUuid: order.uuid,
      provider: updated.provider ?? "UNKNOWN",
      amount: updated.amount,
    });

    MetricsService.increment("payment.started", 1, {
      provider: updated.provider ?? "UNKNOWN",
    });

    return {
      paymentUuid: updated.uuid,
      providerRef: updated.providerRef,
      clientSecret: updated.clientSecret,
      expiresAt: updated.expiresAt,
    };
  }

  //Provider says the payment succeeded (webhook or polling).
  //
  // Runs under row locks on the payment and its order, so concurrent
  // webhook/polling/retry confirmations serialize and only one can move the
  // payment to PAID. The amount and currency the provider actually collected
  // must match the payment exactly.
  static async confirmFromProviderEvent(input: {
    paymentUuid: string;
    providerRef: string;
    amountReceived: number | null; // minor units, as reported by the provider
    currency: string | null;
    snapshot: any;
    source: "WEBHOOK" | "POLLING";
  }): Promise<{ outcome: ConfirmOutcome; paymentUuid: string }> {
    const result = await prisma.$transaction(async (tx) => {
      // Lock order: payment, then order (same order everywhere avoids deadlocks)
      await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "uuid" = ${input.paymentUuid} FOR UPDATE`;

      const payment = await tx.payment.findUnique({
        where: { uuid: input.paymentUuid },
      });
      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "uuid" = ${payment.orderUuid} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { uuid: payment.orderUuid },
      });

      if (payment.status === "PAID" || payment.status === "COMPLETED") {
        return { outcome: "ALREADY_PAID" as const, payment, order, previousOrderStatus: order.status };
      }

      const amountOk = input.amountReceived === payment.amount;
      const currencyOk =
        !!input.currency && input.currency.toUpperCase() === payment.currency.toUpperCase();

      if (!amountOk || !currencyOk) {
        await tx.payment.update({
          where: { uuid: payment.uuid },
          data: {
            flaggedForReview: true,
            flaggedAt: new Date(),
            flagReason:
              `AMOUNT_MISMATCH: expected ${payment.amount} ${payment.currency}, ` +
              `provider reported ${input.amountReceived ?? "unknown"} ${input.currency ?? "unknown"}`,
          },
        });
        return { outcome: "AMOUNT_MISMATCH" as const, payment, order, previousOrderStatus: order.status };
      }

      if (!PaymentStateMachine.canTransition(payment.status, "PAID")) {
        // Money was captured on a payment we consider closed (CANCELLED,
        // REFUNDED, VOIDED...). Nothing automatic is safe here.
        await tx.payment.update({
          where: { uuid: payment.uuid },
          data: {
            flaggedForReview: true,
            flaggedAt: new Date(),
            flagReason: `CAPTURE_ON_${payment.status}_PAYMENT: provider ${input.providerRef}`,
          },
        });
        return { outcome: "PAYMENT_TERMINAL" as const, payment, order, previousOrderStatus: order.status };
      }

      const now = new Date();
      const orderPayable = OrderStatusService.canTransition(order.status, "PAID");

      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "PAID",
          paidAt: now,
          capturedAt: now,
          snapshot: input.snapshot,
          ...(!orderPayable && {
            flaggedForReview: true,
            flaggedAt: now,
            flagReason: `ORDER_NOT_PAYABLE: order was ${order.status} at capture; auto-refund requested`,
          }),
        },
      });

      let updatedOrder = order;
      if (orderPayable) {
        updatedOrder = await tx.order.update({
          where: { uuid: order.uuid },
          data: {
            status: "PAID",
            paymentStatus: "COMPLETED",
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            tenantUuid: order.tenantUuid,
            orderUuid: order.uuid,
            fromStatus: order.status,
            toStatus: "PAID",
            changedBy: "SYSTEM",
            reason: `PAYMENT_CONFIRMED_${input.source}`,
            duration: Math.floor((now.getTime() - order.updatedAt.getTime()) / 1000),
          },
        });
      }

      await tx.paymentAuditSnapshot.create({
        data: {
          tenantUuid: payment.tenantUuid,
          paymentUuid: payment.uuid,
          orderUuid: payment.orderUuid,
          storeUuid: payment.storeUuid,
          reason: "PAYMENT_CAPTURED",
          triggeredBy: "SYSTEM",
          beforeStatus: payment.status,
          afterStatus: "PAID",
          paymentState: updated,
          orderState: updatedOrder,
          metadata: {
            provider: payment.provider,
            providerRef: input.providerRef,
            source: input.source,
            orderPayable,
          },
        },
      });

      return {
        outcome: orderPayable ? ("CONFIRMED" as const) : ("ORDER_NOT_PAYABLE" as const),
        payment: updated,
        order,
        previousOrderStatus: order.status,
      };
    });

    const { outcome, payment } = result;
    MetricsService.increment(`payment.confirm.${outcome.toLowerCase()}`, 1, {
      provider: payment.provider ?? "UNKNOWN",
      source: input.source,
    });

    switch (outcome) {
      case "CONFIRMED":
        EventBus.emit("ORDER_STATUS_CHANGED", {
          orderUuid: payment.orderUuid,
          tenantUuid: payment.tenantUuid,
          storeUuid: payment.storeUuid,
          from: result.previousOrderStatus,
          to: "PAID",
          timestamp: new Date(),
        });
        EventBus.emit("PAYMENT_CONFIRMED", {
          paymentUuid: payment.uuid,
          orderUuid: payment.orderUuid,
          tenantUuid: payment.tenantUuid,
          storeUuid: payment.storeUuid,
          amount: payment.amount,
        });
        logWithContext("info", "[Payment] Confirmed", {
          paymentUuid: payment.uuid,
          orderUuid: payment.orderUuid,
          source: input.source,
        });
        break;

      case "ALREADY_PAID":
        logWithContext("info", "[Payment] Already confirmed (idempotent)", {
          paymentUuid: payment.uuid,
        });
        break;

      case "AMOUNT_MISMATCH":
        logWithContext("error", "[Payment] Amount/currency mismatch — NOT marked paid", {
          paymentUuid: payment.uuid,
          expectedAmount: payment.amount,
          expectedCurrency: payment.currency,
          receivedAmount: input.amountReceived,
          receivedCurrency: input.currency,
        });
        break;

      case "PAYMENT_TERMINAL":
        logWithContext("error", "[Payment] Funds captured on closed payment — manual action required", {
          paymentUuid: payment.uuid,
          status: payment.status,
          providerRef: input.providerRef,
        });
        break;

      case "ORDER_NOT_PAYABLE":
        await this.requestAutoRefund(payment.orderUuid, result.previousOrderStatus);
        break;
    }

    return { outcome, paymentUuid: payment.uuid };
  }

  // Funds were captured for an order that can no longer be fulfilled (e.g.
  // cancelled or expired while the customer was paying). The refund is only
  // requested here; RefundProcessorJob sends it to the provider, so there is
  // a single path that talks to the provider for refunds.
  private static async requestAutoRefund(orderUuid: string, orderStatus: OrderStatus) {
    try {
      const refund = await RefundService.requestRefund({
        orderUuid,
        reason: `AUTO_REFUND: order was ${orderStatus} when payment was captured`,
        requestedBy: "SYSTEM",
      });
      logWithContext("warn", "[Payment] Auto-refund requested for unpayable order", {
        orderUuid,
        refundUuid: refund.uuid,
      });
    } catch (error: any) {
      // Payment is already flagged for review, so this stays visible
      logWithContext("error", "[Payment] Auto-refund request failed", {
        orderUuid,
        error: error.message,
      });
    }
  }

  // Mark payment as failed from provider. Out-of-order or late failure
  // events (e.g. after a successful retry) are ignored, not errors.
  static async markFailedFromProvider(input: {
    paymentUuid: string;
    failureCode: string;
    failureReason?: string;
    snapshot: any;
  }) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "uuid" = ${input.paymentUuid} FOR UPDATE`;

      const payment = await tx.payment.findUnique({
        where: { uuid: input.paymentUuid },
        include: { order: true },
      });
      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      if (payment.status === "FAILED" || !PaymentStateMachine.canTransition(payment.status, "FAILED")) {
        return { changed: false as const, payment };
      }

      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "FAILED",
          failureCode: input.failureCode as any,
          failureReason: input.failureReason,
          failedAt: new Date(),
          snapshot: input.snapshot,
        },
      });

      // Stock stays reserved: the customer may still retry and succeed
      if (OrderStatusService.canTransition(payment.order.status, "PAYMENT_FAILED")) {
        await tx.order.update({
          where: { uuid: payment.orderUuid },
          data: {
            status: "PAYMENT_FAILED",
            paymentStatus: "FAILED",
          },
        });
      }

      return { changed: true as const, payment: updated };
    });

    const { payment } = result;

    if (!result.changed) {
      logWithContext("info", "[Payment] Failure event ignored", {
        paymentUuid: payment.uuid,
        status: payment.status,
      });
      return payment;
    }

    EventBus.emit("PAYMENT_FAILED", {
      paymentUuid: payment.uuid,
      orderUuid: payment.orderUuid,
      tenantUuid: payment.tenantUuid,
      storeUuid: payment.storeUuid,
      failureCode: input.failureCode,
      failureReason: input.failureReason,
    });

    logWithContext("warn", "[Payment] Failed", {
      paymentUuid: payment.uuid,
      orderUuid: payment.orderUuid,
      failureCode: input.failureCode,
    });

    MetricsService.increment("payment.failed", 1, {
      provider: payment.provider ?? "UNKNOWN",
      failureCode: input.failureCode,
    });

    return payment;
  }

  //ACTIVE PROVIDER CONFIRMATION
  static async confirmByPolling(paymentUuid: string) {
    const start = Date.now();
    const payment = await prisma.payment.findUnique({
      where: { uuid: paymentUuid },
    });

    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (!payment.providerRef || !payment.provider) {
      throw new Error("MISSING_PROVIDER_REF");
    }

    try {
      const result = await PaymentProviderAdapter.lookup({
        provider: payment.provider,
        providerRef: payment.providerRef,
      });

      MetricsService.timing("payment.provider.latency", Date.now() - start, {
        provider: payment.provider,
      });

      if (result.status === "PAID") {
        await this.confirmFromProviderEvent({
          paymentUuid: payment.uuid,
          providerRef: payment.providerRef,
          amountReceived: result.amountReceived,
          currency: result.currency,
          snapshot: result.snapshot,
          source: "POLLING",
        });
      } else if (result.status === "FAILED") {
        await this.markFailedFromProvider({
          paymentUuid: payment.uuid,
          failureCode: "PROVIDER_DECLINED",
          failureReason: "Payment declined by provider",
          snapshot: result.snapshot,
        });
      }

      return prisma.payment.findUniqueOrThrow({ where: { uuid: payment.uuid } });
    } catch (error: any) {
      logWithContext("error", "[Payment] Polling failed", {
        paymentUuid: payment.uuid,
        provider: payment.provider,
        error: error.message,
      });
      throw error;
    }
  }

  // Tenant-scoped status check. Only active payments are polled at the
  // provider, and at most once per STATUS_POLL_WINDOW_MS per payment.
  static async getStatusForTenant(input: { paymentUuid: string; tenantUuid: string }) {
    const payment = await prisma.payment.findFirst({
      where: { uuid: input.paymentUuid, tenantUuid: input.tenantUuid },
      select: { uuid: true, status: true, providerRef: true },
    });

    if (!payment) throw new Error("PAYMENT_NOT_FOUND");

    if (!payment.providerRef || !ACTIVE_STATUSES.has(payment.status)) {
      return { uuid: payment.uuid, status: payment.status };
    }

    try {
      const { count } = await hitRateLimitWindow(`payment-poll:${payment.uuid}`, STATUS_POLL_WINDOW_MS);
      if (count > 1) {
        return { uuid: payment.uuid, status: payment.status };
      }
    } catch {
      // Throttle unavailable: fall through and poll
    }

    const polled = await this.confirmByPolling(payment.uuid);
    return { uuid: polled.uuid, status: polled.status };
  }

  // tenantUuid is required for user-initiated retries; the retry job passes
  // undefined because it operates across tenants.
  static async retryFailedPayment(paymentUuid: string, tenantUuid?: string) {
    const payment = await prisma.payment.findFirst({
      where: { uuid: paymentUuid, ...(tenantUuid && { tenantUuid }) },
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    if (payment.retries >= payment.maxRetries) {
      throw new Error("MAX_RETRIES_EXCEEDED");
    }

    PaymentStateMachine.assertTransition(payment.status, "RETRYING");

    // Conditional update so two concurrent retries can't both proceed
    const claimed = await prisma.payment.updateMany({
      where: { uuid: paymentUuid, status: payment.status, retries: payment.retries },
      data: {
        status: "RETRYING",
        retries: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw new Error("PAYMENT_RETRY_IN_PROGRESS");
    }

    const retries = payment.retries + 1;

    MetricsService.increment("payment.retry.attempt", 1, {
      provider: payment.provider ?? "UNKNOWN",
    });

    logWithContext("warn", "[Payment] Retrying", {
      paymentUuid,
      retryCount: retries,
    });

    try {
      return await this.confirmByPolling(paymentUuid);
    } catch (error: any) {
      logWithContext("error", "[Payment] Retry failed", {
        paymentUuid,
        error: error.message,
      });

      if (retries >= payment.maxRetries) {
        await this.markFailedFromProvider({
          paymentUuid,
          failureCode: "MAX_RETRIES_EXCEEDED",
          failureReason: "Payment failed after maximum retries",
          snapshot: {},
        });
      }

      throw error;
    }
  }

  static async cancelFromProvider(input: {
    paymentUuid: string;
    snapshot: any;
  }) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "uuid" = ${input.paymentUuid} FOR UPDATE`;

      const payment = await tx.payment.findUnique({
        where: { uuid: input.paymentUuid },
        include: { order: true },
      });
      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      // Late/duplicate cancel (e.g. after the payment succeeded): ignore
      if (!PaymentStateMachine.canTransition(payment.status, "CANCELLED")) {
        return { changed: false as const, payment };
      }

      const updated = await tx.payment.update({
        where: { uuid: payment.uuid },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: "SYSTEM",
          snapshot: input.snapshot,
        },
      });

      if (OrderStatusService.canTransition(payment.order.status, "CANCELLED")) {
        await tx.order.update({
          where: { uuid: payment.orderUuid },
          data: {
            status: "CANCELLED",
            paymentStatus: "CANCELLED",
          },
        });
      }

      return { changed: true as const, payment: updated };
    });

    if (result.changed) {
      EventBus.emit("PAYMENT_CANCELLED", {
        paymentUuid: result.payment.uuid,
        orderUuid: result.payment.orderUuid,
      });
    }

    return result.payment;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
