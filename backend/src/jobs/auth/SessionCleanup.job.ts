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
