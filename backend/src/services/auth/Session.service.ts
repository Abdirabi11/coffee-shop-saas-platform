import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";


const SESSION_EXPIRY_HOURS = 24;
const MOBILE_SESSION_EXPIRY_HOURS = 720; // 30 days for offline-first mobile
 
export class SessionService {
    static async create(input: {
        userUuid: string;
        tenantUuid?: string;
        refreshTokenUuid: string;
        storeUuid?: string;
        req: any;
    }) {
        const userAgent = input.req.headers["user-agent"] || "unknown";
        const deviceId = (input.req.headers["x-device-id"] as string) || "unknown";

        const deviceFingerprint =
            (input.req.headers["x-fingerprint"] as string) ||
            (input.req.headers["x-device-fingerprint"] as string) ||
            "unknown";
    
        const ipAddress =
            (input.req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            input.req.ip ||
            input.req.socket?.remoteAddress ||
            "unknown";
    
        const deviceType = this.getDeviceType(userAgent);
        const isMobile = deviceType === "MOBILE" || deviceType === "TABLET";
    
        const expiryHours = isMobile
            ? MOBILE_SESSION_EXPIRY_HOURS
            : SESSION_EXPIRY_HOURS;
    
        return prisma.session.create({
            data: {
                userUuid: input.userUuid,
                tenantUuid: input.tenantUuid,
                refreshTokenUuid: input.refreshTokenUuid,
                storeUuid: input.storeUuid,
                deviceId,
                deviceType,
                deviceFingerprint,            
                deviceOS: this.extractOS(userAgent),
                deviceBrowser: this.extractBrowser(userAgent),
                ipAddress,
                userAgent,
                expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
                status: "ACTIVE",
            },
        });
    }
 
    static async revokeAllForUser(input: {
        userUuid: string;
        storeUuid?: string;
        revokedBy?: string;
        reason?: string;
    }) {
        const where = {
            userUuid: input.userUuid,
            ...(input.storeUuid && { storeUuid: input.storeUuid }),
            status: "ACTIVE" as const,
        };
    
        // FIX #3: Update BOTH fields
        await prisma.session.updateMany({
            where,
            data: {
                revoked: true,
                revokedAt: new Date(),
                revokedBy: input.revokedBy ?? "SYSTEM",
                revokedReason: input.reason ?? "All sessions revoked",
                status: "REVOKED",  
            },
        });
    
        // Also revoke refresh tokens
        await prisma.refreshToken.updateMany({
            where: {
                userUuid: input.userUuid,
                status: "ACTIVE",
            },
            data: {
                revoked: true,
                revokedAt: new Date(),
                status: "REVOKED",
                revokedReason: (input.reason ?? "ADMIN_REVOKE") as any,
            },
        });
    
        logWithContext("info", "[Session] All sessions revoked", {
            userUuid: input.userUuid,
            storeUuid: input.storeUuid,
        });
    }
 
    static async listActive(userUuid: string) {
        return prisma.session.findMany({
            where: {
                userUuid,
                status: "ACTIVE",
                expiresAt: { gt: new Date() },
            },
            select: {
                uuid: true,
                deviceType: true,
                deviceName: true,
                deviceOS: true,
                deviceBrowser: true,
                ipAddress: true,
                lastActivityAt: true,
                createdAt: true,
                storeUuid: true,
            },
            orderBy: { lastActivityAt: "desc" },
        });
    }

    static async logoutByToken(refreshToken: string) {
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
        });
    
        if (!storedToken) return;
    
        // Revoke refresh token
        await prisma.refreshToken.update({
            where: { uuid: storedToken.uuid },
            data: {
                revoked: true,
                revokedAt: new Date(),
                status: "REVOKED",
                revokedReason: "USER_LOGOUT",
            },
        });
    
        // Revoke session using the token's UUID
        await prisma.session.updateMany({
            where: { refreshTokenUuid: storedToken.uuid },
            data: {
                revoked: true,
                revokedAt: new Date(),
                status: "REVOKED",
                revokedReason: "User logout",
            },
        });
    }
 
    static async touchActivity(sessionUuid: string) {
        await prisma.session.update({
            where: { uuid: sessionUuid },
            data: { lastActivityAt: new Date(), lastUsedAt: new Date() },
        }).catch(() => {}); 
    }

    static async revokeSession(input: {
        sessionUuid: string;
        revokedBy: string;
        reason?: string;
    }) {
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
    
        // Also revoke the refresh token linked to this session
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
    }

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
    
        return token?.sessions[0] ?? null;
    }

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
        }
    
        if (!input.includeRevoked) {
            where.status = "ACTIVE";
        }
    
        return prisma.session.findMany({
            where,
            include: {
                refreshToken: {
                select: {
                    // Don't expose the actual token value
                    expiresAt: true,
                    status: true,
                },
                },
            },
            orderBy: { lastUsedAt: "desc" },
        });
    }
 
    static async revokeAllSessions(input: {
        userUuid: string;
        storeUuid?: string;
        revokedBy: string;
        reason?: string;
    }) {
        return this.revokeAllForUser(input);
    }
 
    static async createUserSession(
        userUuid: string,
        refreshTokenUuid: string,
        req: any
    ) {
        return this.create({
            userUuid,
            refreshTokenUuid,
            storeUuid: req.headers?.["x-store-uuid"] as string,
            req,
        });
    }
 
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
 
    private static getDeviceType(userAgent: string): string {
        const ua = userAgent.toLowerCase();
        if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return "MOBILE";
        if (ua.includes("tablet") || ua.includes("ipad")) return "TABLET";
        if (ua.includes("postman") || ua.includes("insomnia")) return "API_CLIENT";
        return "WEB";
    }
 
    private static extractOS(userAgent: string): string {
        if (/android/i.test(userAgent)) return "Android";
        if (/iphone|ipad|ios/i.test(userAgent)) return "iOS";
        if (/windows/i.test(userAgent)) return "Windows";
        if (/mac os/i.test(userAgent)) return "macOS";
        if (/linux/i.test(userAgent)) return "Linux";
        return "Unknown";
    }
 
    private static extractBrowser(userAgent: string): string {
        if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) return "Chrome";
        if (/firefox/i.test(userAgent)) return "Firefox";
        if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return "Safari";
        if (/edge/i.test(userAgent)) return "Edge";
        return "Unknown";
    }
}
 
export const createUserSession = SessionService.createUserSession.bind(SessionService);
export const revokeAllSessions = SessionService.revokeAllSessions.bind(SessionService);
export const listSessions = SessionService.listSessions.bind(SessionService);
 