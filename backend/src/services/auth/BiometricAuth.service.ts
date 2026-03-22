import crypto from "crypto";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";

export class BiometricAuthService {
  // Enable biometric auth for a device
  static async enable(input: {
    userUuid: string;
    deviceId: string;
    deviceFingerprint: string;
    publicKey: string;
    biometricType: "FINGERPRINT" | "FACE_ID" | "IRIS";
  }) {
    const biometricToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(biometricToken).digest("hex");
 
    await prisma.biometricAuth.upsert({
      where: {
        userUuid_deviceId: {
          userUuid: input.userUuid,
          deviceId: input.deviceId,
        },
      },
      update: {
        tokenHash: hashedToken,
        publicKey: input.publicKey,
        biometricType: input.biometricType,
        enabled: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        disabledAt: null,
      },
      create: {
        userUuid: input.userUuid,
        deviceId: input.deviceId,
        deviceFingerprint: input.deviceFingerprint,
        biometricType: input.biometricType,
        tokenHash: hashedToken,
        publicKey: input.publicKey,
        enabled: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
 
    logWithContext("info", "[BiometricAuth] Enabled", {
      userUuid: input.userUuid,
      deviceId: input.deviceId,
      type: input.biometricType,
    });
 
    // Return token for client to store in secure keychain
    return {
      biometricToken,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };
  }
 
  // Authenticate with biometric token
  static async authenticate(input: {
    deviceId: string;
    biometricToken: string;
    req: any;
  }) {
    const hashedToken = crypto.createHash("sha256").update(input.biometricToken).digest("hex");
 
    const biometricAuth = await prisma.biometricAuth.findFirst({
      where: {
        deviceId: input.deviceId,
        tokenHash: hashedToken,
        enabled: true,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
 
    if (!biometricAuth) throw new Error("INVALID_BIOMETRIC_TOKEN");
    if (biometricAuth.user.isBanned || biometricAuth.user.isGloballyBanned) {
      throw new Error("ACCOUNT_BANNED");
    }
 
    // Update usage
    await prisma.biometricAuth.update({
      where: { uuid: biometricAuth.uuid },
      data: { lastUsedAt: new Date(), usedCount: { increment: 1 } },
    });
 
    // Get tenant context
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { userUuid: biometricAuth.userUuid, isActive: true },
      select: { tenantUuid: true },
    });
 
    // ── FIX: Use TokenService instead of inline creation ────────────
    const tokens = await TokenService.issueTokenPair({
      userUuid: biometricAuth.userUuid,
      tenantUuid: tenantUser?.tenantUuid,
      role: biometricAuth.user.globalRole,
      req: input.req,
    });
 
    logWithContext("info", "[BiometricAuth] Login successful", {
      userUuid: biometricAuth.userUuid,
      deviceId: input.deviceId,
    });
 
    return {
      user: biometricAuth.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
 
  // Disable biometric auth for a device
  static async disable(input: { userUuid: string; deviceId: string }) {
    await prisma.biometricAuth.updateMany({
      where: { userUuid: input.userUuid, deviceId: input.deviceId },
      data: { enabled: false, disabledAt: new Date() },
    });
 
    logWithContext("info", "[BiometricAuth] Disabled", {
      userUuid: input.userUuid,
      deviceId: input.deviceId,
    });
  }
 
  // Check if user has biometric enabled on a device
  static async isEnabled(userUuid: string, deviceId: string): Promise<boolean> {
    const auth = await prisma.biometricAuth.findFirst({
      where: { userUuid, deviceId, enabled: true, expiresAt: { gt: new Date() } },
    });
    return !!auth;
  }
}