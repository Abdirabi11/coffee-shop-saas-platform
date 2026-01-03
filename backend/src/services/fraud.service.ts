import prisma from "../utils/prisma";
import { evaluateAutoBan, notifyAdmins } from "../security";

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