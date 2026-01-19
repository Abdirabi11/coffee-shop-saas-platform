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
  static async signal(
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

  private static mapSeverity(type: string) {
    switch (type) {
      case "MULTIPLE_PAYMENT_FAILED":
      case "REFUND_ABUSE":
        return "HIGH";
      case "PAYMENT_TIMEOUT":
        return "MEDIUM";
      default:
        return "LOW";
    }
  }
}