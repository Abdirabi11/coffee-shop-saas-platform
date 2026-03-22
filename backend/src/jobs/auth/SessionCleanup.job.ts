import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class SessionCleanupJob{
    static async run(){
        const startTime = Date.now();
    
        logWithContext("info", "[SessionCleanup] Starting cleanup");
    
        try {
            const now = new Date();
        
            // Update expired sessions
            const sessionResult = await prisma.session.updateMany({
                where: {
                    expiresAt: { lt: now },
                    status: "ACTIVE",
                },
                data: {
                    status: "EXPIRED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: "SYSTEM",
                    revokedReason: "Session expired",
                },
            });
    
            // Update expired refresh tokens
            const tokenResult = await prisma.refreshToken.updateMany({
                where: {
                    expiresAt: { lt: now },
                    status: "ACTIVE",
                },
                data: {
                    status: "EXPIRED",
                    revoked: true,
                    revokedAt: now,
                    revokedBy: "SYSTEM",
                    revokedReason: "EXPIRED",
                },
            });
    
            // Delete old expired sessions (older than 90 days)
            const deleteOldCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            
            const deletedSessions = await prisma.session.deleteMany({
                where: {
                    status: "EXPIRED",
                    expiresAt: { lt: deleteOldCutoff },
                },
            });
        
            const deletedTokens = await prisma.refreshToken.deleteMany({
                where: {
                    status: "EXPIRED",
                    expiresAt: { lt: deleteOldCutoff },
                },
            });
    
            const duration = Date.now() - startTime;
        
            logWithContext("info", "[SessionCleanup] Cleanup completed", {
                expiredSessions: sessionResult.count,
                expiredTokens: tokenResult.count,
                deletedSessions: deletedSessions.count,
                deletedTokens: deletedTokens.count,
                durationMs: duration,
            });
    
            MetricsService.increment("session.cleanup.expired", sessionResult.count);
            MetricsService.increment("token.cleanup.expired", tokenResult.count);
            MetricsService.timing("session.cleanup.duration", duration);
        
            return {
                expiredSessions: sessionResult.count,
                expiredTokens: tokenResult.count,
                deletedSessions: deletedSessions.count,
                deletedTokens: deletedTokens.count,
            };
    
        } catch (error: any) {
            logWithContext("error", "[SessionCleanup] Cleanup failed", {
                error: error.message,
            });
        
            MetricsService.increment("session.cleanup.error", 1);
        
            throw error;
        }
    }
}

export class SessionCleanupJob {
  static cronSchedule = "30 3 * * *";
 
  static async run() {
    const startTime = Date.now();
    logWithContext("info", "[SessionCleanup] Starting");
 
    try {
      const sevenDaysAgo = dayjs().subtract(7, "day").toDate();
      const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();
      const ninetyDaysAgo = dayjs().subtract(90, "day").toDate();
 
      // 1. Delete expired sessions (expired > 7 days ago)
      const expiredSessions = await prisma.session.deleteMany({
        where: {
          status: { in: ["EXPIRED", "REVOKED"] },
          updatedAt: { lt: sevenDaysAgo },
        },
      });
 
      // 2. Delete expired/revoked refresh tokens (> 7 days old)
      const expiredTokens = await prisma.refreshToken.deleteMany({
        where: {
          status: { in: ["EXPIRED", "REVOKED", "REUSED"] },
          updatedAt: { lt: sevenDaysAgo },
        },
      });
 
      // 3. Mark still-active but expired sessions as EXPIRED
      const staleActive = await prisma.session.updateMany({
        where: {
          status: "ACTIVE",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });
 
      // 4. Mark still-active but expired tokens as EXPIRED
      const staleTokens = await prisma.refreshToken.updateMany({
        where: {
          status: "ACTIVE",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });
 
      // 5. Clean up old login attempts (> 30 days)
      const oldAttempts = await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lt: thirtyDaysAgo } },
      });
 
      // 6. Clean up old untrusted devices (existing method)
      const devicesCleaned = await DeviceTrustService.cleanupOldDevices();
 
      // 7. Clean up old security events (> 90 days, resolved only)
      const oldSecurityEvents = await prisma.securityEvent.deleteMany({
        where: {
          resolved: true,
          createdAt: { lt: ninetyDaysAgo },
        },
      });
 
      const duration = Date.now() - startTime;
 
      logWithContext("info", "[SessionCleanup] Completed", {
        expiredSessions: expiredSessions.count,
        expiredTokens: expiredTokens.count,
        staleActive: staleActive.count,
        staleTokens: staleTokens.count,
        oldAttempts: oldAttempts.count,
        devicesCleaned,
        oldSecurityEvents: oldSecurityEvents.count,
        durationMs: duration,
      });
 
      MetricsService.increment("auth.session_cleanup.sessions", expiredSessions.count);
      MetricsService.increment("auth.session_cleanup.tokens", expiredTokens.count);
 
      return {
        expiredSessions: expiredSessions.count,
        expiredTokens: expiredTokens.count,
        staleActive: staleActive.count,
        oldAttempts: oldAttempts.count,
      };
    } catch (error: any) {
      logWithContext("error", "[SessionCleanup] Failed", {
        error: error.message,
      });
      throw error;
    }
  }
}
