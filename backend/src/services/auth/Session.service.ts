import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class SessionService {
  
    //Create user session
    static async createUserSession(
        userUuid: string,
        refreshTokenUuid: string,
        req: Request
    ) {
        try {
            const deviceFingerprint = req.headers["x-device-fingerprint"] as string || "unknown";
            const deviceId = req.headers["x-device-id"] as string || "unknown";
            const deviceType = req.headers["x-device-type"] as string || "UNKNOWN";
            const storeUuid = req.headers["x-store-uuid"] as string;
    
            const session = await prisma.session.create({
                data: {
                    userUuid,
                    refreshTokenUuid,
                    storeUuid,
                    deviceId,
                    deviceType,
                    deviceFingerprint,
                    ipAddress: req.ip!,
                    userAgent: req.headers["user-agent"],
                    status: "ACTIVE",
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                },
            });
  
            logWithContext("info", "[Session] Session created", {
                sessionUuid: session.uuid,
                userUuid,
            });
    
            MetricsService.increment("session.created", 1);
    
            return session;
  
        } catch (error: any) {
            logWithContext("error", "[Session] Failed to create session", {
                error: error.message,
                userUuid,
            });
    
            throw error;
        }
    }
  
    //Update session activity
    static async updateSessionActivity(sessionUuid: string) {
        try {
            await prisma.session.update({
                where: { uuid: sessionUuid },
                data: {
                    lastActivityAt: new Date(),
                    lastUsedAt: new Date(),
                },
            });
    
        } catch (error: any) {
            logWithContext("error", "[Session] Failed to update session activity", {
                error: error.message,
            });
        }
    }
  
   
    //Revoke session
    static async revokeSession(input: {
        sessionUuid: string;
        revokedBy: string;
        reason?: string;
    }) {
        try {
            const session = await prisma.session.update({
                where: { uuid: input.sessionUuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: input.revokedBy,
                    revokedReason: input.reason,
                },
            });
  
            // Also revoke the refresh token
            await prisma.refreshToken.update({
                where: { uuid: session.refreshTokenUuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: input.revokedBy,
                    revokedReason: "SESSION_REVOKED",
                },
            });
    
            logWithContext("info", "[Session] Session revoked", {
                sessionUuid: input.sessionUuid,
            });
    
            MetricsService.increment("session.revoked", 1);
  
        } catch (error: any) {
            logWithContext("error", "[Session] Failed to revoke session", {
                error: error.message,
            });
    
            throw error;
        }
    }
  
  
    //Revoke all user sessions
    static async revokeAllSessions(input: {
        userUuid: string;
        storeUuid?: string;
        revokedBy: string;
        reason?: string;
    }) {
        try {
            const where: any = {
                userUuid: input.userUuid,
                status: "ACTIVE",
            };
    
            if (input.storeUuid) {
                where.storeUuid = input.storeUuid;
            }
    
            // Revoke sessions
            await prisma.session.updateMany({
                where,
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: input.revokedBy,
                    revokedReason: input.reason || "All sessions revoked",
                },
            });
    
            // Revoke refresh tokens
            await prisma.refreshToken.updateMany({
                where: {
                    userUuid: input.userUuid,
                    status: "ACTIVE",
                },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: input.revokedBy,
                    revokedReason: "ALL_SESSIONS_REVOKED",
                },
            });
    
            logWithContext("info", "[Session] All sessions revoked", {
                userUuid: input.userUuid,
            });
    
            MetricsService.increment("session.revoked_all", 1);
    
        } catch (error: any) {
            logWithContext("error", "[Session] Failed to revoke all sessions", {
                error: error.message,
            });
    
            throw error;
        }
    }
  
    //List user sessions
    static async listSessions(input: {
        userUuid: string;
        storeUuid?: string;
        includeRevoked?: boolean;
    }) {
        const where: any = {
            userUuid: input.userUuid,
        };
    
        if (input.storeUuid) {
            where.storeUuid = input.storeUuid;
        };
    
        if (!input.includeRevoked) {
            where.status = "ACTIVE";
        };
  
        return prisma.session.findMany({
            where,
            include: {
                refreshToken: {
                    select: {
                    token: false,
                    expiresAt: true,
                    status: true,
                    },
                },
            },
            orderBy: { lastUsedAt: "desc" },
        });
    }
  
    //Get session by refresh token
    static async getSessionByRefreshToken(refreshToken: string) {
        const token = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: {
                sessions: {
                    where: { status: "ACTIVE" },
                    take: 1,
                },
            },
        });
  
        return token?.sessions[0];
    }
  
    //Clean up expired sessions
    static async cleanupExpiredSessions() {
      const now = new Date();
  
        const result = await prisma.session.updateMany({
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
    
        logWithContext("info", "[Session] Cleaned up expired sessions", {
            count: result.count,
        });
    
        return result.count;
    }
}
  
// Export for backward compatibility
export const createUserSession = SessionService.createUserSession;
export const revokeAllSessions = SessionService.revokeAllSessions;
export const listSessions = SessionService.listSessions;
  