import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { DeviceTrustService } from "../../services/security/DeviceTrust.service.ts";

 
export class SessionCleanupJob {
  static cronSchedule = "30 3 * * *";
 
  static async run() {
    const startTime = Date.now();
    logWithContext("info", "[SessionCleanup] Starting");
 
    try {
      const now = new Date();
      const sevenDaysAgo = dayjs().subtract(7, "day").toDate();
      const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();
      const ninetyDaysAgo = dayjs().subtract(90, "day").toDate();
 
      const staleActiveSessions = await prisma.session.updateMany({
        where: {
          status: "ACTIVE",
          expiresAt: { lt: now },
        },
        data: {
          status: "EXPIRED",
          revoked: true,
          revokedAt: now,
          revokedBy: "SYSTEM",
          revokedReason: "Session expired",
        },
      });
 
      const staleActiveTokens = await prisma.refreshToken.updateMany({
        where: {
          status: "ACTIVE",
          expiresAt: { lt: now },
        },
        data: {
          status: "EXPIRED",
          revoked: true,
          revokedAt: now,
          revokedBy: "SYSTEM",
          revokedReason: "EXPIRED",
        },
      });

      const deletedSessions = await prisma.session.deleteMany({
        where: {
          status: { in: ["EXPIRED", "REVOKED"] },
          updatedAt: { lt: sevenDaysAgo },
        },
      });
 
      const deletedTokens = await prisma.refreshToken.deleteMany({
        where: {
          status: { in: ["EXPIRED", "REVOKED", "REUSED"] },
          updatedAt: { lt: sevenDaysAgo },
        },
      });
 
      const deletedAttempts = await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lt: thirtyDaysAgo } },
      });
 
      const devicesCleaned = await DeviceTrustService.cleanupOldDevices();
 
      const deletedSecurityEvents = await prisma.securityEvent.deleteMany({
        where: {
          resolved: true,
          createdAt: { lt: ninetyDaysAgo },
        },
      });
 
      const duration = Date.now() - startTime;
 
      logWithContext("info", "[SessionCleanup] Completed", {
        staleActiveSessions: staleActiveSessions.count,
        staleActiveTokens: staleActiveTokens.count,
        deletedSessions: deletedSessions.count,
        deletedTokens: deletedTokens.count,
        deletedAttempts: deletedAttempts.count,
        devicesCleaned,
        deletedSecurityEvents: deletedSecurityEvents.count,
        durationMs: duration,
      });
 
      MetricsService.increment("auth.cleanup.sessions_expired", staleActiveSessions.count);
      MetricsService.increment("auth.cleanup.tokens_expired", staleActiveTokens.count);
      MetricsService.increment("auth.cleanup.sessions_deleted", deletedSessions.count);
      MetricsService.increment("auth.cleanup.tokens_deleted", deletedTokens.count);
      MetricsService.timing("auth.cleanup.duration", duration);
 
      return {
        staleActiveSessions: staleActiveSessions.count,
        staleActiveTokens: staleActiveTokens.count,
        deletedSessions: deletedSessions.count,
        deletedTokens: deletedTokens.count,
        deletedAttempts: deletedAttempts.count,
        deletedSecurityEvents: deletedSecurityEvents.count,
      };
    } catch (error: any) {
      logWithContext("error", "[SessionCleanup] Failed", {
        error: error.message,
      });
      MetricsService.increment("auth.cleanup.error", 1);
      throw error;
    }
  }
}
