import { v4 as uuidv4 } from "uuid";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.ts";
import { SessionService } from "./Session.service.ts";
  
// Refresh token lifetime: 30 days for mobile (offline-first), 7 days for web
const MOBILE_TOKEN_EXPIRY_DAYS = 30;
const WEB_TOKEN_EXPIRY_DAYS = 7;
 
export class TokenService { 
  static async issueTokenPair(input: {
    userUuid: string;
    tenantUuid?: string;
    role: string;
    req: any;
    storeUuid?: string;
  }) {
    const deviceFingerprint =
      (input.req.headers["x-fingerprint"] as string) ||
      (input.req.headers["x-device-fingerprint"] as string) ||
      "unknown";
    const deviceId = (input.req.headers["x-device-id"] as string) || "unknown";
    const userAgent = input.req.headers["user-agent"] || "unknown";
    const ipAddress =
      (input.req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      input.req.ip ||
      input.req.socket?.remoteAddress ||
      "unknown";
    const isMobile = /mobile|android|iphone/i.test(userAgent);
    const expiryDays = isMobile ? MOBILE_TOKEN_EXPIRY_DAYS : WEB_TOKEN_EXPIRY_DAYS;
 
    // Get current tokenVersion for JWT payload
    const user = await prisma.user.findUnique({
      where: { uuid: input.userUuid },
      select: { tokenVersion: true },
    });
    const tokenVersion = user?.tokenVersion ?? 1;
 
    // Generate tokens (include tokenVersion so rotation can verify)
    const accessToken = signAccessToken({
      userUuid: input.userUuid,
      tenantUuid: input.tenantUuid,
      role: input.role,
      tokenVersion,
    });
 
    const refreshTokenValue = signRefreshToken({
      userUuid: input.userUuid,
      tokenVersion,
    });
 
    // Create NEW token family
    const tokenFamily = uuidv4();
 
    // FIX #1: All required fields populated
    const refreshToken = await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userUuid: input.userUuid,
        tenantUuid: input.tenantUuid,
        tokenFamily,
        version: 1,
        parentTokenUuid: null,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
        issuedFrom: ipAddress,
        deviceFingerprint,
        deviceId,
        userAgent,
        status: "ACTIVE",
      },
    });
 
    // Create session
    await SessionService.create({
      userUuid: input.userUuid,
      tenantUuid: input.tenantUuid,
      refreshTokenUuid: refreshToken.uuid,
      storeUuid: input.storeUuid,
      req: input.req,
    });
 
    logWithContext("info", "[Token] Token pair issued", {
      userUuid: input.userUuid,
      tokenFamily,
      version: 1,
    });
 
    return { accessToken, refreshToken: refreshTokenValue };
  }
 
  static async rotate(token: string, req: any) {
    // Verify JWT signature
    let decoded: { userUuid: string };
    try {
      decoded = verifyRefreshToken(token) as { userUuid: string };
    } catch {
      throw new Error("INVALID_REFRESH_TOKEN");
    }
 
    // Find stored token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
 
    if (!storedToken) {
      throw new Error("TOKEN_NOT_FOUND");
    }

    if (storedToken.revoked || storedToken.status !== "ACTIVE") {
      logWithContext("error", "[Token] REUSE DETECTED — revoking entire family", {
        userUuid: storedToken.userUuid,
        tokenFamily: storedToken.tokenFamily,
        tokenVersion: storedToken.version,
        status: storedToken.status,
      });
 
      // Mark this specific token as reused (for forensics)
      await prisma.refreshToken.update({
        where: { uuid: storedToken.uuid },
        data: { reused: true, reusedAt: new Date() },
      });
 
      // REVOKE ENTIRE FAMILY — all tokens in this chain
      await prisma.refreshToken.updateMany({
        where: { tokenFamily: storedToken.tokenFamily },
        data: {
          revoked: true,
          revokedAt: new Date(),
          status: "REVOKED",
          revokedReason: "SUSPICIOUS_ACTIVITY",
        },
      });
 
      // Revoke all sessions from this family
      const familyTokens = await prisma.refreshToken.findMany({
        where: { tokenFamily: storedToken.tokenFamily },
        select: { uuid: true },
      });
 
      await prisma.session.updateMany({
        where: {
          refreshTokenUuid: { in: familyTokens.map((t) => t.uuid) },
          status: "ACTIVE",
        },
        data: {
          status: "REVOKED",
          revoked: true,
          revokedAt: new Date(),
          revokedReason: "Token reuse detected — possible theft",
        },
      });
 
      // Record fraud event
      const tenantUuid = storedToken.tenantUuid || "SYSTEM";
      await prisma.fraudEvent.create({
        data: {
          tenantUuid,
          userUuid: storedToken.userUuid,
          storeUuid: "SYSTEM", // Required field — no store context during token rotation
          type: "ACCOUNT_TAKEOVER_ATTEMPT",
          category: "AUTHENTICATION",
          severity: "CRITICAL",
          reason: `Refresh token reuse detected (family: ${storedToken.tokenFamily}, version: ${storedToken.version})`,
          ipAddress: req.ip || "unknown",
          deviceFingerprint: req.headers?.["x-fingerprint"] as string,
          status: "CONFIRMED",
        },
      });
 
      MetricsService.increment("auth.token_reuse_detected", 1);
 
      throw new Error("TOKEN_REUSE_DETECTED");
    }
 
    // Check expiry
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { uuid: storedToken.uuid },
        data: { status: "EXPIRED" },
      });
      throw new Error("TOKEN_EXPIRED");
    }
 
    if (
      (decoded as any).tokenVersion !== undefined &&
      (decoded as any).tokenVersion !== storedToken.user.tokenVersion
    ) {
      throw new Error("TOKEN_VERSION_MISMATCH");
    }
 
    // Check if user is banned
    if (storedToken.user.isBanned || storedToken.user.isGloballyBanned) {
      throw new Error("ACCOUNT_BANNED");
    }
  
    // Revoke the old token
    await prisma.refreshToken.update({
      where: { uuid: storedToken.uuid },
      data: {
        revoked: true,
        revokedAt: new Date(),
        status: "REVOKED",
        revokedReason: "TOKEN_ROTATION",
        usedCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
 
    // Revoke old session
    await prisma.session.updateMany({
      where: {
        refreshTokenUuid: storedToken.uuid,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedReason: "Token rotated",
      },
    });
 
    // Device info for new token
    const deviceFingerprint =
      (req.headers["x-fingerprint"] as string) ||
      storedToken.deviceFingerprint;
    const deviceId =
      (req.headers["x-device-id"] as string) || storedToken.deviceId || "unknown";
    const userAgent = req.headers["user-agent"] || storedToken.userAgent || "unknown";
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.ip ||
      "unknown";
    const isMobile = /mobile|android|iphone/i.test(userAgent);
    const expiryDays = isMobile ? MOBILE_TOKEN_EXPIRY_DAYS : WEB_TOKEN_EXPIRY_DAYS;
 
    // Generate new tokens
    const newAccessToken = signAccessToken({
      userUuid: storedToken.user.uuid,
      role: storedToken.user.globalRole,
      tokenVersion: storedToken.user.tokenVersion,
    });
 
    const newRefreshTokenValue = signRefreshToken({
      userUuid: storedToken.user.uuid,
      tokenVersion: storedToken.user.tokenVersion,
    });
 
    const newStoredToken = await prisma.refreshToken.create({
      data: {
        token: newRefreshTokenValue,
        userUuid: storedToken.user.uuid,
        tenantUuid: storedToken.tenantUuid,
        // Family chain tracking
        tokenFamily: storedToken.tokenFamily,       // Same family
        version: storedToken.version + 1,            // Increment version
        parentTokenUuid: storedToken.uuid,           // Link to parent
        // Required security fields
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
        issuedFrom: ipAddress,
        deviceFingerprint,
        deviceId,
        userAgent,
        status: "ACTIVE",
      },
    });
 
    // Create new session
    await SessionService.create({
      userUuid: storedToken.user.uuid,
      tenantUuid: storedToken.tenantUuid,
      refreshTokenUuid: newStoredToken.uuid,
      storeUuid: undefined,
      req,
    });
 
    logWithContext("info", "[Token] Token rotated", {
      userUuid: storedToken.user.uuid,
      tokenFamily: storedToken.tokenFamily,
      oldVersion: storedToken.version,
      newVersion: storedToken.version + 1,
    });
 
    MetricsService.increment("auth.token_rotated", 1);
 
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenValue,
    };
  }
 
  // REVOKE TOKEN (logout)
  static async revoke(token: string, reason: string = "USER_LOGOUT") {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
    });
 
    if (!storedToken) return;
 
    await prisma.refreshToken.update({
      where: { uuid: storedToken.uuid },
      data: {
        revoked: true,
        revokedAt: new Date(),
        status: "REVOKED",
        revokedReason: reason as any,
      },
    });
 
    // Revoke associated session
    await prisma.session.updateMany({
      where: {
        refreshTokenUuid: storedToken.uuid,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }
 
  // REVOKE ALL USER TOKENS (password change, account compromise)
  static async revokeAllForUser(userUuid: string, reason: string = "ADMIN_REVOKE") {
    await prisma.refreshToken.updateMany({
      where: { userUuid, status: "ACTIVE" },
      data: {
        revoked: true,
        revokedAt: new Date(),
        status: "REVOKED",
        revokedReason: reason as any,
      },
    });
 
    await prisma.session.updateMany({
      where: { userUuid, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
 
    logWithContext("info", "[Token] All tokens revoked for user", {
      userUuid,
      reason,
    });
  }
 
  static async invalidateAllTokens(userUuid: string) {
    // Increment tokenVersion — invalidates all JWTs containing old version
    await prisma.user.update({
      where: { uuid: userUuid },
      data: { tokenVersion: { increment: 1 } },
    });
 
    // Also explicitly revoke all tokens and sessions
    await this.revokeAllForUser(userUuid, "TOKEN_VERSION_INCREMENTED");
 
    logWithContext("info", "[Token] All tokens invalidated via version bump", {
      userUuid,
    });
 
    MetricsService.increment("auth.tokens_invalidated_all", 1);
  }

  static async revokeTokenFamily(tokenFamily: string, reason: string) {
    await prisma.refreshToken.updateMany({
      where: { tokenFamily, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedBy: "SYSTEM",
        revokedReason: reason as any,
      },
    });
 
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
 
    logWithContext("warn", "[Token] Token family revoked", { tokenFamily, reason });
  }
}