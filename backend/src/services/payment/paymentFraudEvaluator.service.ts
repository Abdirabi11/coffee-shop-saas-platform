import prisma from "../../config/prisma.ts"
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

export class PaymentFraudEvaluator{
  //evaluate fraud based on event type
  static async evaluate(type: string, payload: FraudPayload){
    try {
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
        
        case "PAYMENT_TIMEOUT":
          await this.onPaymentTimeout(payload);
          break;
  
        default:
          console.warn(`[FraudEvaluator] Unknown event type: ${type}`);
      }
    } catch (errora: any) {
      console.error(`[FraudEvaluator] Error evaluating ${type}:`, error.message);
    }
  }

  //Handle payment failure fraud signals
  static async onPaymentFailed(payload: FraudPayload){
    const { tenantUserUuid, provider, failureCode, amount, ipAddress } = payload;
    
    if (!tenantUserUuid) return;

    let totalRiskIncrease = 0;
    const reasons: string[] = [];

    //Check failure velocity (3+ failures in 10 minutes = suspicious)
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

      // Create fraud event
      await prisma.fraudEvent.create({
        data: {
          tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
          tenantUserUuid,
          type: "MULTIPLE_PAYMENT_FAILED",
          severity: "HIGH",
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

    //Provider fraud signals
    if (
      failureCode === "FRAUD_SUSPECTED" ||
      failureCode === "STOLEN_CARD" ||
      failureCode === "FRAUDULENT"
    ) {
      totalRiskIncrease += 50;
      reasons.push("PROVIDER_FRAUD_SIGNAL");

      await prisma.fraudEvent.create({
        data: {
          tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
          tenantUserUuid,
          type: "PROVIDER_FRAUD_SIGNAL",
          severity: "CRITICAL",
          metadata: {
            provider,
            failureCode,
          },
        },
      });
    }

    //High-risk IP detection
    if (ipAddress && (await this.isHighRiskIP(ipAddress))) {
      totalRiskIncrease += 20;
      reasons.push("HIGH_RISK_IP");

      await prisma.fraudEvent.create({
        data: {
          tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
          tenantUserUuid,
          type: "HIGH_RISK_IP",
          severity: "MEDIUM",
          metadata: { ipAddress },
        },
      });
    }

    //Large amount failure (>$500)
    if (amount && amount > 50000) {
      totalRiskIncrease += 15;
      reasons.push("HIGH_AMOUNT_FAILURE");
    }

    //Applying risk score increase
    if (totalRiskIncrease > 0) {
      await PaymentRiskScoreService.increase({
        tenantUserUuid,
        delta: totalRiskIncrease,
        reason: reasons.join(", "),
        source: "FRAUD_EVALUATOR",
      });

      // Apply restrictions based on new score
      await RiskPolicyEnforcer.apply(tenantUserUuid);
    }

    console.log(`[FraudEvaluator] Payment failed: Risk +${totalRiskIncrease} (${reasons.join(", ")})`);
  }

  //Handle payment success (positive signal - reduce risk)
  static async onPaymentSuccess(payload: FraudPayload) {
    const { tenantUserUuid, amount } = payload;
    if(tenantUserUuid) return;

    const currentScore = await PaymentRiskScoreService.get(tenantUserUuid);

    // Reduce risk score for successful payment (max -5 points)
    if (currentScore > 0) {
      const reduction = Math.min(5, currentScore);
      
      await PaymentRiskScoreService.adjust({
        tenantUserUuid,
        newScore: currentScore - reduction,
        reason: "SUCCESSFUL_PAYMENT",
      });

      console.log(`[FraudEvaluator] Payment success: Risk -${reduction}`);
    }
    // Create positive fraud signal
    await prisma.fraudEvent.create({
      data: {
        tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
        tenantUserUuid,
        type: "PAYMENT_SUCCESS",
        severity: "LOW",
        metadata: { amount },
      },
    });
  }

  //Handle refund completion fraud signals
  static async onRefundCompleted(payload: FraudPayload) {
    const {tenantUserUuid, refundUuid, amount }= payload
    if(tenantUserUuid) return;

    let totalRiskIncrease= 0;
    const reasons: string[]= [] 

    // Get refund statistics for this user
    const stats= await this.getRefundStats(tenantUserUuid);

    //High refund ratio (>40% of payments)
    if(stats.refundRatio > 0.4){
      totalRiskIncrease += 40;
      reasons.push("HIGH_REFUND_RATIO");

      await prisma.fraudEvent.create({
        data: {
          tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
          tenantUserUuid,
          type: "HIGH_REFUND_RATIO",
          severity: "HIGH",
          metadata: {
            refundRatio: stats.refundRatio,
            totalPayments: stats.totalPayments,
            totalRefunds: stats.totalRefunds,
          },
        },
      });
    };

     //Refund velocity (3+ refunds in 7 days)
    if(stats.refundsLast7Days >= 3) {
      totalRiskIncrease += 30;
      reasons.push("REFUND_VELOCITY");

      await prisma.fraudEvent.create({
        data: {
          tenantUuid: (await this.getTenantUuid(tenantUserUuid))!,
          tenantUserUuid,
          type: "REFUND_VELOCITY",
          severity: "HIGH",
          metadata: {
            refundCount: stats.refundsLast7Days,
            timeWindow: "7_days",
          },
        },
      });
    };

    //High amount refund (>$500)
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
    };

    console.log(`[FraudEvaluator] Refund completed: Risk +${totalRiskIncrease} (${reasons.join(", ")})`);
  }

  //Handle payment timeout
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

    console.log(`[FraudEvaluator] Payment timeout: Risk +5`);
  }

  //Get refund statistics for user
  private static async getRefundStats(tenantUserUuid: string) {
    const totalPayments = await prisma.payment.count({
      where: {
        order: { tenantUserUuid },
        status: "PAID",
      },
    });

    const totalRefunds = await prisma.refund.count({
      where: {
        payment: {
          order: { tenantUserUuid },
        },
        status: "COMPLETED",
      },
    });

    const refundsLast7Days = await prisma.refund.count({
      where: {
        payment: {
          order: { tenantUserUuid },
        },
        status: "COMPLETED",
        processedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    return {
      totalPayments,
      totalRefunds,
      refundRatio: totalPayments > 0 ? totalRefunds / totalPayments : 0,
      refundsLast7Days,
    };
  }

  private static async isHighRiskIP(ipAddress: string): Promise<boolean> {
    if (ipAddress === "127.0.0.1" || ipAddress.startsWith("192.168.")) {
      return false;
    }

    // Check against known fraud IP list
    const knownFraudIP = await prisma.fraudIPAddress.findUnique({
      where: { ipAddress },
    });

    if (knownFraudIP) {
      return true;
    }

    // Optional: Call external IP reputation API
    // const reputation = await axios.get(`https://ip-reputation-api.com/check/${ipAddress}`);
    // return reputation.data.risk_score > 70;

    return false;
  }

  //Get tenant UUID from tenant user
  private static async getTenantUuid(tenantUserUuid: string): Promise<string | null> {
    const tenantUser = await prisma.tenantUser.findUnique({
      where: { uuid: tenantUserUuid },
      select: { tenantUuid: true },
    });

    return tenantUser?.tenantUuid || null;
  }

  // static async detectFailureVelocity(){

  // }
  
  // private static async detectFailureVelocity({ userUuid }) {
  //     if (!userUuid) return;

  //     const count = await prisma.fraudEvent.count({
  //         where: {
  //           userUuid,
  //           type: "PAYMENT_FAILED",
  //           createdAt: {
  //             gt: new Date(Date.now() - 10 * 60 * 1000),
  //           },
  //         },
  //     });

  //     if (count >= 3) {
  //         await prisma.fraudEvent.create({
  //           data: {
  //             userUuid,
  //             type: "MULTIPLE_PAYMENT_FAILED",
  //             severity: "HIGH",
  //           },
  //         });
    
  //         // optional action
  //         await evaluateAutoBan(userUuid);
  //     }
  // }

  // private static async detectRefundAbuse({ orderUuid, amount }) {
  //     if (!orderUuid) return;
  
  //     if (amount && amount > 500) {
  //       await prisma.fraudEvent.create({
  //         data: {
  //           orderUuid,
  //           type: "REFUND_ABUSE",
  //           severity: "HIGH",
  //         },
  //       });
  //     }
  // }
};