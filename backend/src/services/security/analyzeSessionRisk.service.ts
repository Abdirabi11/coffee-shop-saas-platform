import prisma from "../../config/prisma.ts"
import { evaluateAutoBan } from "../../security/fraud.engine.ts";
import { isTrustedDevice } from "./deviceTrust.service.ts";
import { revokeUserSessions } from "./revokeUserSessions.service.ts";

export const analyzeSessionRisk = async (
    userUuid: string,
    storeUuid: string,
    req: any
  ) => {
    const fingerprintHash = req.headers["x-fingerprint"] as string;

    const trustedDevice = await isTrustedDevice(userUuid, fingerprintHash);

    const recentSessions = await prisma.session.count({
      where: {
        userUuid,
        storeUuid,
        revoked: false,
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000),
        },
      },
    });

    const distinctFingerprints = await prisma.session.findMany({
      where: {
        userUuid,
        storeUuid,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      distinct: ["fingerprintHash"],
      select: { fingerprintHash: true },
    });
  
    let severity: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    let reason = "";

    if (!trustedDevice && recentSessions > 3) {
      severity = "MEDIUM";
      reason = "Rapid login from untrusted device";
    };

    if (!trustedDevice && distinctFingerprints.length >= 4) {
      severity = "HIGH";
      reason = "Multiple untrusted devices in short time";
    };

    if (severity !== "LOW") {
      await prisma.fraudEvent.create({
        data: {
          userUuid,
          storeUuid,
          ipAddress: req.ip,
          severity,
          reason,
        },
      });
    };
  
    if (severity === "HIGH") {
      await prisma.adminAlert.create({
        data: {
          type: "SECURITY",
          message: `High-risk login behavior detected for user ${userUuid}`,
        },
      });
  
      await revokeUserSessions(userUuid, storeUuid);

      await evaluateAutoBan(userUuid);
    }
};