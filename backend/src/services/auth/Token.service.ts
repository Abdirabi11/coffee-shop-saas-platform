import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.ts";
import { SessionService } from "./Session.service.ts";

export class TokenService{
    static async rotateRefreshToken(input: {
        token: string;
        req: Request;
    }){
        logWithContext("info", "[Token] Rotating refresh token");

        try {
            // Verify token
            const decoded = verifyRefreshToken(input.token) as {
                userUuid: string;
                tokenVersion: number;
            };
        
            // Get stored token
            const storedToken = await prisma.refreshToken.findUnique({
                where: { token: input.token },
                include: {
                    user: true,
                    sessions: {
                        where: { status: "ACTIVE" },
                        take: 1,
                    },
                },
            });
    
            if (!storedToken) {
                throw new Error("TOKEN_NOT_FOUND");
            };
    
            // Check if token is already used (REUSE DETECTION)
            if (storedToken.revoked || storedToken.status === "REVOKED") {
                logWithContext("warn", "[Token] Token reuse detected", {
                    userUuid: decoded.userUuid,
                    tokenFamily: storedToken.tokenFamily,
                });
        
                // CRITICAL: Revoke entire token family
                await this.revokeTokenFamily(storedToken.tokenFamily, "TOKEN_REUSE_DETECTED");
        
                // Record fraud event
                await prisma.fraudEvent.create({
                    data: {
                        tenantUuid: storedToken.user.tenantUsers[0]?.tenantUuid || "SYSTEM",
                        userUuid: storedToken.userUuid,
                        type: "ACCOUNT_TAKEOVER_ATTEMPT",
                        category: "AUTHENTICATION",
                        severity: "CRITICAL",
                        reason: "Refresh token reuse detected - possible token theft",
                        ipAddress: input.req.ip,
                        deviceFingerprint: input.req.headers["x-device-fingerprint"] as string,
                        status: "CONFIRMED",
                    },
                });
        
                throw new Error("TOKEN_REUSED");
            };
    
            // Check token version
            if (decoded.tokenVersion !== storedToken.user.tokenVersion) {
                throw new Error("TOKEN_VERSION_MISMATCH");
            };
        
            // Check if user is banned
            if (storedToken.user.isBanned || storedToken.user.isGloballyBanned) {
                throw new Error("ACCOUNT_BANNED");
            };
        
            // Mark old token as revoked
            await prisma.refreshToken.update({
                where: { uuid: storedToken.uuid },
                data: {
                    status: "REVOKED",
                    revoked: true,
                    revokedAt: new Date(),
                    revokedBy: "SYSTEM",
                    revokedReason: "TOKEN_ROTATION",
                },
            });
    
            // Revoke old session
            if (storedToken.sessions.length > 0) {
                await SessionService.revokeSession({
                    sessionUuid: storedToken.sessions[0].uuid,
                    revokedBy: "SYSTEM",
                    reason: "Token rotated",
                });
            };
    
            // Generate new tokens
            const newAccessToken = signAccessToken({
                userUuid: storedToken.user.uuid,
                role: storedToken.user.globalRole,
                tokenVersion: storedToken.user.tokenVersion,
            });
        
            const newRefreshToken = signRefreshToken({
                userUuid: storedToken.user.uuid,
                tokenVersion: storedToken.user.tokenVersion,
            });
        
            // Store new refresh token (same token family)
            const newStoredToken = await prisma.refreshToken.create({
                data: {
                    token: newRefreshToken,
                    userUuid: storedToken.userUuid,
                    tenantUuid: storedToken.tenantUuid,
                    tokenFamily: storedToken.tokenFamily, // Same family
                    version: storedToken.version + 1, // Increment version
                    parentTokenUuid: storedToken.uuid, // Track chain
                    deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
                    deviceId: input.req.headers["x-device-id"] as string || "unknown",
                    issuedFrom: input.req.ip!,
                    userAgent: input.req.headers["user-agent"],
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    status: "ACTIVE",
                },
            });
        
            // Create new session
            await SessionService.createUserSession(
                storedToken.user.uuid,
                newStoredToken.uuid,
                input.req
            );
        
            logWithContext("info", "[Token] Refresh token rotated successfully", {
                userUuid: storedToken.user.uuid,
                oldVersion: storedToken.version,
                newVersion: newStoredToken.version,
            });
        
            MetricsService.increment("token.rotated", 1);
        
            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                user: storedToken.user,
            };
    
        } catch (error: any) {
            logWithContext("error", "[Token] Failed to rotate refresh token", {
                error: error.message,
            });
        
            MetricsService.increment("token.rotation_failed", 1);
        
            throw error;
        }
    }

    //Revoke entire token family (for security breach)

    private static async revokeTokenFamily(
        tokenFamily: string,
        reason: string
    ) {
        await prisma.refreshToken.updateMany({
            where: {
                tokenFamily,
                status: "ACTIVE",
            },
            data: {
                status: "REVOKED",
                revoked: true,
                revokedAt: new Date(),
                revokedBy: "SYSTEM",
                revokedReason: reason,
            },
        });
      
        // Also revoke all sessions in this family
        const tokens = await prisma.refreshToken.findMany({
            where: { tokenFamily },
            select: { uuid: true },
        });
      
        await prisma.session.updateMany({
            where: {
                refreshTokenUuid: { in: tokens.map((t) => t.uuid) },
                status: "ACTIVE",
            },
            data: {
                status: "REVOKED",
                revoked: true,
                revokedAt: new Date(),
                revokedBy: "SYSTEM",
                revokedReason: reason,
            },
        });
      
        logWithContext("warn", "[Token] Token family revoked", {
            tokenFamily,
            reason,
        });
      
    }

    //Revoke all user tokens
    static async revokeAllUserTokens(input: {
        userUuid: string;
        reason: string;
        revokedBy: string;
    }) {
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
                revokedReason: input.reason,
            },
        });

        await SessionService.revokeAllSessions({
            userUuid: input.userUuid,
            revokedBy: input.revokedBy,
            reason: input.reason,
        });

        logWithContext("info", "[Token] All user tokens revoked", {
            userUuid: input.userUuid,
        });
    }

    //Invalidate all tokens (password change, security breach)
    static async invalidateAllTokens(userUuid: string) {
        // Increment token version (invalidates all existing tokens)
        await prisma.user.update({
            where: { uuid: userUuid },
            data: {
                tokenVersion: { increment: 1 },
            },
        });

        // Revoke all tokens
        await this.revokeAllUserTokens({
            userUuid,
            reason: "Token version incremented",
            revokedBy: "SYSTEM",
        });

        logWithContext("info", "[Token] All tokens invalidated", { userUuid });

        MetricsService.increment("token.invalidated_all", 1);
    }
}

export const rotateRefreshTokenService = TokenService.rotateRefreshToken;