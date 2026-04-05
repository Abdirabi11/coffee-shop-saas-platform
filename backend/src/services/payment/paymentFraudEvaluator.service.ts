import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { PaymentRiskScoreService } from "./paymentRiskScore.service.ts";

interface FraudPayload {
  tenantUserUuid?: string;
  orderUuid?: string;
  paymentUuid?: string;
  refundUuid?: string;
  provider?: string;
  failureCode?: string;
  amount?: number;
  ipAddress?: string;
  eventTime?: Date;
}

export class PaymentFraudEvaluator {
  static async evaluate(type: string, payload: FraudPayload) {
    try {
      switch (type) {
        case "PAYMENT_FAILED":
          await this.onPaymentFailed(payload);
          break;
 
        case "PAYMENT_CONFIRMED":
          await this.onPaymentSuccess(payload);
          break;
 
        case "REFUND_COMPLETED":
          await this.onRefundCompleted(payload);
          break;
 
        case "PAYMENT_TIMEOUT":
          await this.onPaymentTimeout(payload);
          break;
 
        default:
          logWithContext("warn", "[FraudEvaluator] Unknown event type", { type });
      }
    } catch (error: any) {
      logWithContext("error", "[FraudEvaluator] Evaluation failed", {
        type,
        error: error.message,
      });
    }
  }
 
  // Handle payment failure fraud signals
  static async onPaymentFailed(payload: FraudPayload) {
    const { tenantUserUuid, provider, failureCode, amount, ipAddress } =
      payload;
 
    if (!tenantUserUuid) return;
 
    let totalRiskIncrease = 0;
    const reasons: string[] = [];
 
    // Get tenant context for FraudEvent creation
    const tenantContext = await this.getTenantContext(tenantUserUuid);
    if (!tenantContext) return;
 
    // Check failure velocity (3+ failures in 10 minutes = suspicious)
    const recentFailures = await prisma.payment.count({
      where: {
        order: { tenantUserUuid },
        status: "FAILED",
        failedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    });
 
    if (recentFailures >= 3) {
      totalRiskIncrease += 40;
      reasons.push("MULTIPLE_PAYMENT_FAILED");
 
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: tenantContext.tenantUuid,
          userUuid: tenantUserUuid,
          storeUuid: tenantContext.storeUuid,
          type: "PAYMENT_FAILED_MULTIPLE",
          category: "PAYMENT",
          severity: "HIGH",
          reason: `${recentFailures} payment failures in 10 minutes`,
          ipAddress: ipAddress || "UNKNOWN",
          metadata: {
            failureCount: recentFailures,
            timeWindow: "10_minutes",
          },
        },
      });
    } else if (recentFailures >= 1) {
      totalRiskIncrease += 10;
      reasons.push("PAYMENT_FAILED");
    }
 
    // Provider fraud signals
    if (
      failureCode === "FRAUD_SUSPECTED" ||
      failureCode === "STOLEN_CARD" ||
      failureCode === "FRAUDULENT"
    ) {
      totalRiskIncrease += 50;
      reasons.push("PROVIDER_FRAUD_SIGNAL");
 
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: tenantContext.tenantUuid,
          userUuid: tenantUserUuid,
          storeUuid: tenantContext.storeUuid,
          type: "PAYMENT_FAILED_MULTIPLE", // Closest valid FraudType enum value
          category: "PAYMENT",
          severity: "CRITICAL",
          reason: `Provider fraud signal: ${failureCode}`,
          ipAddress: ipAddress || "UNKNOWN",
          metadata: { provider, failureCode },
        },
      });
    }
 
    // High-risk IP detection
    if (ipAddress && (await this.isHighRiskIP(ipAddress))) {
      totalRiskIncrease += 20;
      reasons.push("HIGH_RISK_IP");
 
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: tenantContext.tenantUuid,
          userUuid: tenantUserUuid,
          storeUuid: tenantContext.storeUuid,
          type: "SUSPICIOUS_DEVICE", // Closest valid FraudType
          category: "DEVICE",
          severity: "MEDIUM",
          reason: `Payment from high-risk IP: ${ipAddress}`,
          ipAddress,
          metadata: { ipAddress },
        },
      });
    }
 
    // Large amount failure (>$500)
    if (amount && amount > 50000) {
      totalRiskIncrease += 15;
      reasons.push("HIGH_AMOUNT_FAILURE");
    }
 
    // Apply risk score increase
    if (totalRiskIncrease > 0) {
      await PaymentRiskScoreService.increase({
        tenantUserUuid,
        delta: totalRiskIncrease,
        reason: reasons.join(", "),
        source: "FRAUD_EVALUATOR",
      });
 
      await RiskPolicyEnforcer.apply(tenantUserUuid);
    }
 
    logWithContext("info", "[FraudEvaluator] Payment failed evaluated", {
      tenantUserUuid,
      riskIncrease: totalRiskIncrease,
      reasons,
    });
  }
 
  static async onPaymentSuccess(payload: FraudPayload) {
    const { tenantUserUuid, amount } = payload;
    if (!tenantUserUuid) return;
 
    const tenantContext = await this.getTenantContext(tenantUserUuid);
    if (!tenantContext) return;
 
    const currentScore = await PaymentRiskScoreService.get(
      tenantContext.tenantUuid,
      tenantUserUuid
    );
 
    // Reduce risk score for successful payment (max -5 points)
    if (currentScore > 0) {
      const reduction = Math.min(5, currentScore);
 
      await PaymentRiskScoreService.adjust({
        tenantUserUuid,
        newScore: currentScore - reduction,
        reason: "SUCCESSFUL_PAYMENT",
      });
 
      logWithContext("info", "[FraudEvaluator] Risk reduced on success", {
        tenantUserUuid,
        reduction,
      });
    }
  }
 
  static async onRefundCompleted(payload: FraudPayload) {
    const { tenantUserUuid, refundUuid, amount } = payload;
    if (!tenantUserUuid) return;
 
    const tenantContext = await this.getTenantContext(tenantUserUuid);
    if (!tenantContext) return;
 
    let totalRiskIncrease = 0;
    const reasons: string[] = [];
 
    // Get refund statistics for this user
    const stats = await this.getRefundStats(tenantUserUuid);
 
    // High refund ratio (>40% of payments)
    if (stats.refundRatio > 0.4) {
      totalRiskIncrease += 40;
      reasons.push("HIGH_REFUND_RATIO");
 
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: tenantContext.tenantUuid,
          userUuid: tenantUserUuid,
          storeUuid: tenantContext.storeUuid,
          type: "REFUND_ABUSE",
          category: "PAYMENT",
          severity: "HIGH",
          reason: `Refund ratio ${(stats.refundRatio * 100).toFixed(1)}% exceeds 40% threshold`,
          ipAddress: "SYSTEM",
          metadata: {
            refundRatio: stats.refundRatio,
            totalPayments: stats.totalPayments,
            totalRefunds: stats.totalRefunds,
          },
        },
      });
    }
 
    // Refund velocity (3+ refunds in 7 days)
    if (stats.refundsLast7Days >= 3) {
      totalRiskIncrease += 30;
      reasons.push("REFUND_VELOCITY");
 
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: tenantContext.tenantUuid,
          userUuid: tenantUserUuid,
          storeUuid: tenantContext.storeUuid,
          type: "REFUND_ABUSE",
          category: "PAYMENT",
          severity: "HIGH",
          reason: `${stats.refundsLast7Days} refunds in 7 days`,
          ipAddress: "SYSTEM",
          metadata: {
            refundCount: stats.refundsLast7Days,
            timeWindow: "7_days",
          },
        },
      });
    }
 
    // High amount refund (>$500)
    if (amount && amount > 50000) {
      totalRiskIncrease += 20;
      reasons.push("HIGH_AMOUNT_REFUND");
    }
 
    // Apply risk score increase
    if (totalRiskIncrease > 0) {
      await PaymentRiskScoreService.increase({
        tenantUserUuid,
        delta: totalRiskIncrease,
        reason: reasons.join(", "),
        source: "FRAUD_EVALUATOR",
      });
 
      await RiskPolicyEnforcer.apply(tenantUserUuid);
    }
 
    logWithContext("info", "[FraudEvaluator] Refund evaluated", {
      tenantUserUuid,
      riskIncrease: totalRiskIncrease,
      reasons,
    });
  }
 
  // Handle payment timeout
  static async onPaymentTimeout(payload: FraudPayload) {
    const { tenantUserUuid } = payload;
 
    if (!tenantUserUuid) return;
 
    // Timeout is a weak signal (only +5 risk)
    await PaymentRiskScoreService.increase({
      tenantUserUuid,
      delta: 5,
      reason: "PAYMENT_TIMEOUT",
      source: "FRAUD_EVALUATOR",
    });
 
    logWithContext("info", "[FraudEvaluator] Payment timeout recorded", {
      tenantUserUuid,
      riskIncrease: 5,
    });
  }
 
  // Get refund statistics for user
  private static async getRefundStats(tenantUserUuid: string) {
    const [totalPayments, totalRefunds, refundsLast7Days] = await Promise.all([
      prisma.payment.count({
        where: {
          order: { tenantUserUuid },
          status: { in: ["PAID", "COMPLETED"] }, // FIX: include both payment statuses
        },
      }),
      prisma.refund.count({
        where: {
          payment: { order: { tenantUserUuid } },
          status: "COMPLETED",
        },
      }),
      prisma.refund.count({
        where: {
          payment: { order: { tenantUserUuid } },
          status: "COMPLETED",
          processedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);
 
    return {
      totalPayments,
      totalRefunds,
      refundRatio: totalPayments > 0 ? totalRefunds / totalPayments : 0,
      refundsLast7Days,
    };
  }
 
  private static async isHighRiskIP(
    ipAddress: string
  ): Promise<boolean> {
    if (
      ipAddress === "127.0.0.1" ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.")
    ) {
      return false;
    }
 
    const knownFraudIP = await prisma.fraudIPAddress.findUnique({
      where: { ipAddress },
    });
 
    return !!knownFraudIP;
  }
 
  private static async getTenantContext(
    tenantUserUuid: string
  ): Promise<{ tenantUuid: string; storeUuid: string } | null> {
    const tenantUser = await prisma.tenantUser.findUnique({
      where: { uuid: tenantUserUuid },
      select: {
        tenantUuid: true,
        // Get their primary store for fraud event context
        storeAccess: {
          where: { isPrimary: true, isActive: true },
          select: { storeUuid: true },
          take: 1,
        },
      },
    });
 
    if (!tenantUser) return null;
 
    return {
      tenantUuid: tenantUser.tenantUuid,
      storeUuid: tenantUser.storeAccess[0]?.storeUuid || "",
    };
  }
}
