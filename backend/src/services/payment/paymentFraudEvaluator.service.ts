import prisma from "../../config/prisma.ts"
import { NormalizedProviderError } from "../../domain/payments/paymentErrors.ts";
import { RiskPolicyEnforcer } from "../fraud/riskPolicyEnforcer.service.ts";
import { evaluateAutoBan } from "../superAdmin/evaluateAutoBan.service.ts";
import { PaymentRiskScoreService } from "./paymentRiskScore.service.ts";

type FraudPayload = {
  userUuid?: string;
  orderUuid?: string;
  paymentUuid?: string;
  provider?: string;
  failureCode?: NormalizedProviderError;
  amount?: number;
  ipAddress?: string;
  eventTime?: Date;
};

export class PaymentFraudEvaluator{
  static async evaluate(type: string, payload: FraudPayload){
    switch(type){
      case "PAYMENT_FAILED":
        await this.onPaymentFailed(payload)
        break;

      case "PAYMENT_CONFIRMED":
        await this.onPaymentSuccess(payload)
        break;
      
      case "REFUND_COMPLETED":
        await this.onRefundCompleted(payload)
        break;
    }
  }

  private static async onPaymentFailed(payload: FraudPayload) {
    const {userUuid, provider, failureCode, amount, ipAddress}= payload;
    if (!userUuid) return;

    // 1️⃣ Failure velocity
    const recentFailures = await prisma.payment.count({
      where: {
        userUuid,
        status: "FAILED",
        createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) }
      }
    });

    if (recentFailures >= 3) {
      await PaymentRiskScoreService.increase(userUuid, 30, "FAILURE_VELOCITY");
    };

    if (
      failureCode === "STOLEN_CARD" ||
      failureCode === "FRAUD_SUSPECTED"
    ) {
      await PaymentRiskScoreService.increase(userUuid, 50, "PROVIDER_FRAUD_SIGNAL");
    }

    // 3️⃣ IP mismatch / risky IP
    if (await isHighRiskIp(ipAddress)) {
      await PaymentRiskScoreService.increase(userUuid, 20, "RISKY_IP");
    };

    await RiskPolicyEnforcer.apply(userUuid);
  }

  private static async onRefundCompleted(payload: FraudPayload) {
    const { userUuid, amount } = payload;
    if (!userUuid) return;

    const stats= await RefundAnalyticsService.getUserStats(userUuid)

    if (stats.refundRatio > 0.4) {
      await PaymentRiskScoreService.increase(userUuid, 40, "HIGH_REFUND_RATIO");
    };

    if (stats.refundsLast7Days >= 3) {
      await PaymentRiskScoreService.increase(userUuid, 30, "REFUND_VELOCITY");
    };

    if (amount && amount > 500) {
      await PaymentRiskScoreService.increase(userUuid, 20, "HIGH_AMOUNT_REFUND");
    };

    await RiskPolicyEnforcer.apply(userUuid);
  }

  private static async onPaymentSuccess(payload: FraudPayload) {

  }

  private static async detectFailureVelocity({ userUuid }) {
      if (!userUuid) return;

      const count = await prisma.fraudEvent.count({
          where: {
            userUuid,
            type: "PAYMENT_FAILED",
            createdAt: {
              gt: new Date(Date.now() - 10 * 60 * 1000),
            },
          },
      });

      if (count >= 3) {
          await prisma.fraudEvent.create({
            data: {
              userUuid,
              type: "MULTIPLE_PAYMENT_FAILED",
              severity: "HIGH",
            },
          });
    
          // optional action
          await evaluateAutoBan(userUuid);
      }
  }

  private static async detectRefundAbuse({ orderUuid, amount }) {
      if (!orderUuid) return;
  
      if (amount && amount > 500) {
        await prisma.fraudEvent.create({
          data: {
            orderUuid,
            type: "REFUND_ABUSE",
            severity: "HIGH",
          },
        });
      }
  }
};