import prisma from "../config/prisma.ts"
import { evaluateAutoBan } from "../security/fraud.engine.ts"
import { notifyAdmins } from "../utils/adminAlert.ts";

export const recordOtpFraud = async ({
  userUuid,
  ipAddress,
}: {
  userUuid: string;
  ipAddress?: string;
}) => {
  await prisma.fraudEvent.create({
    data: {
      userUuid,
      ipAddress,
      reason: "Too many OTP attempts",
      severity: "HIGH",
    },
  });

  await evaluateAutoBan(userUuid);

  await notifyAdmins({
    userUuid,
    reason: "Rapid multi-device login",
    severity: "MEDIUM",
    ipAddress,
  });
};

export const calculateFraudScore = ({
    rapidSessions,
    newFingerprint,
    geoChanged,
  }: {
    rapidSessions: boolean;
    newFingerprint: boolean;
    geoChanged: boolean;
  }) => {
    let score = 0;
  
    if (rapidSessions) score += 40;
    if (newFingerprint) score += 30;
    if (geoChanged) score += 30;
  
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
};

export class FraudSignalService{
  static async signalAuth(
    type: string,
    payload: {
      orderUuid?: string;
      userUuid?: string;
      amount?: number;
      reason?: string;
    }
  ){
    await prisma.fraudEvent.create({
      data: {
        userUuid: payload.userUuid,
        reason: type,
        metadata: payload,
        severity: this.mapSeverity(type),
      },
    })
  };

  static async signalPayment(
    type: PaymentFraudType,
    payload: {
      userUuid?: string;
      orderUuid?: string;
      paymentUuid?: string;
      storeUuid?: string;
      amount?: number;
      ipAddress?: string;
    }
  ){
    await prisma.fraudEvent.create({
      data: {
        type,
        severity: this.mapPaymentSeverity(type),
        ...payload,
        metadata: payload,
      },
    });

    await PaymentFraudEvaluator.evaluate(type, payload);
  }

  static async signalAuth(
    type: AuthFraudType,
    payload: any
  ) {
    await prisma.fraudEvent.create({
      data: {
        type,
        severity: "HIGH",
        metadata: payload,
      },
    });
  }

  private static mapPaymentSeverity(type: string) {
    switch (type) {
      case "PAYMENT_FAILED":
        return "LOW";
      case "MULTIPLE_PAYMENT_FAILED":
        return "HIGH";
      case "REFUND_ABUSE":
        return "HIGH";
      case "PAYMENT_TIMEOUT":
        return "MEDIUM";
      default:
        return "LOW";
    }
  }
}