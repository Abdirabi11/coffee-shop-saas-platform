import type { Request} from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { generateOtp, hashOtp, otpExpiry, compareOtp } from "./otp.service.ts";
import { SMSService } from "../notification/sms.service.ts";
import { EmailService } from "../notification/Email.service.ts";
import { FraudService } from "../security/Fraud.service.ts";
import { TokenService } from "./Token.service.ts";
import { DeviceTrustService } from "../security/DeviceTrust.service.ts";
import { TwoFactorService } from "./TwoFactor.service.ts";
import { redis } from "../../lib/redis.ts";
import { SessionRiskService } from "../security/SessionRisk.service.ts";

export class AuthService {
 
  static async requestSignupOtp(input: {
    phoneNumber: string;
    method?: "SMS" | "EMAIL";
    email?: string;
  }) {
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
 
    if (existingUser?.isVerified) {
      throw new Error("PHONE_ALREADY_REGISTERED");
    }
 
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);
 
    if (existingUser) {
      await prisma.user.update({
        where: { phoneNumber: input.phoneNumber },
        data: {
          otpCode: hashedOtp,
          otpExpiresAt: otpExpiry(),
          otpAttempts: 0,
          otpMethod: input.method || "SMS",
        },
      });
    } else {
      await prisma.user.create({
        data: {
          phoneNumber: input.phoneNumber,
          email: input.email?.toLowerCase(),
          firstName: "",
          lastName: "",
          otpCode: hashedOtp,
          otpExpiresAt: otpExpiry(),
          otpMethod: input.method || "SMS",
          globalRole: "CUSTOMER",
          isVerified: false,
        },
      });
    }
 
    // Send OTP via chosen method
    if (input.method === "EMAIL" && input.email) {
      await EmailService.send({
        to: input.email,
        subject: "Your Verification Code",
        template: "otp-verification",
        data: { otp, expiresIn: "5 minutes" },
      });
    } else {
      await SMSService.send({
        to: input.phoneNumber,
        message: `Your verification code is: ${otp}. Valid for 5 minutes.`,
      });
    }
 
    logWithContext("info", "[Auth] Signup OTP sent", {
      phoneNumber: input.phoneNumber,
      method: input.method || "SMS",
    });
    MetricsService.increment("auth.signup_otp.sent", 1);
 
    return { success: true };
  }
 
  static async verifySignup(input: {
    phoneNumber: string;
    code: string;
    name?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    req: any;
  }) {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
 
    if (!user) throw new Error("OTP_NOT_REQUESTED");
    if (user.isVerified) throw new Error("PHONE_ALREADY_REGISTERED");
 
    if (user.otpAttempts >= 5) {
      await FraudService.recordLoginBruteForce({
        userUuid: user.uuid,
        tenantUuid: "SYSTEM",
        ipAddress: input.req.ip || "unknown",
        attemptUuid: "signup",
      });
      throw new Error("TOO_MANY_ATTEMPTS");
    }
 
    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new Error("OTP_EXPIRED");
    }
 
    const valid = await compareOtp(input.code, user.otpCode!);
    if (!valid) {
      await prisma.user.update({
        where: { phoneNumber: input.phoneNumber },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new Error("INVALID_OTP");
    }
 
    // Mark user as verified
    const verifiedUser = await prisma.user.update({
      where: { phoneNumber: input.phoneNumber },
      data: {
        name: input.name
          || `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim()
          || undefined,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        email: input.email?.toLowerCase(),
        isVerified: true,
        phoneVerified: true,
        otpCode: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        lastLoginAt: new Date(),
        lastLoginIp: input.req.ip,
      },
    });
 
    // Issue tokens
    const tokens = await TokenService.issueTokenPair({
      userUuid: verifiedUser.uuid,
      role: verifiedUser.globalRole,
      req: input.req,
    });
 
    // Trust this device (first device after signup)
    await DeviceTrustService.trustDevice({
      userUuid: verifiedUser.uuid,
      deviceFingerprint:
        (input.req.headers["x-fingerprint"] as string) ||
        (input.req.headers["x-device-fingerprint"] as string) ||
        "unknown",
      deviceId: (input.req.headers["x-device-id"] as string) || "unknown",
      ipAddress: input.req.ip || "unknown",
      req: input.req,
    });
 
    logWithContext("info", "[Auth] Signup verified", { userUuid: verifiedUser.uuid });
    MetricsService.increment("auth.signup.success", 1);
 
    return {
      user: verifiedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
 
  static async requestLoginOtp(input: {
    phoneNumber: string;
    ipAddress: string;
    userAgent?: string;
    deviceFingerprint?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
 
    if (!user || !user.isVerified) throw new Error("USER_NOT_FOUND");
    if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("ACCOUNT_LOCKED");
 
    // Trusted device → skip OTP
    const isTrusted = await DeviceTrustService.isTrustedDevice(
      user.uuid,
      input.deviceFingerprint
    );
    if (isTrusted) {
      return {
        skipOtp: true,
        userUuid: user.uuid,
        message: "Trusted device — OTP not required",
      };
    }
 
    // Rate limit per IP (10 attempts / 15 min)
    const recentAttempts = await prisma.loginAttempt.count({
      where: {
        ipAddress: input.ipAddress,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recentAttempts >= 10) throw new Error("RATE_LIMIT_EXCEEDED");
 
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);
 
    const attempt = await prisma.loginAttempt.create({
      data: {
        phoneNumber: input.phoneNumber,
        otpCode: hashedOtp,
        expiresAt: otpExpiry(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceFingerprint: input.deviceFingerprint,
      },
    });
 
    await SMSService.send({
      to: input.phoneNumber,
      message: `Your login code is: ${otp}. Valid for 5 minutes.`,
    });
 
    logWithContext("info", "[Auth] Login OTP sent", { attemptUuid: attempt.uuid });
    MetricsService.increment("auth.login_otp.sent", 1);
 
    return { skipOtp: false, attemptUuid: attempt.uuid, message: "OTP sent" };
  }
 
  static async verifyLoginOtp(input: {
    attemptUuid?: string;
    code?: string;
    userUuid?: string;
    trustedDevice?: boolean;
    req: any;
  }) {
    let user: any;
 
    if (input.trustedDevice && input.userUuid) {
      user = await prisma.user.findUnique({ where: { uuid: input.userUuid } });
      if (!user) throw new Error("USER_NOT_FOUND");
    } else {
      // ── STANDARD OTP PATH ───────────────────────────────────────────
      if (!input.attemptUuid || !input.code) throw new Error("ATTEMPT_AND_CODE_REQUIRED");
 
      const attempt = await prisma.loginAttempt.findUnique({
        where: { uuid: input.attemptUuid },
      });
 
      if (!attempt || attempt.used) throw new Error("INVALID_ATTEMPT");
      if (attempt.attempts >= 5) throw new Error("TOO_MANY_ATTEMPTS");
      if (attempt.expiresAt < new Date()) throw new Error("OTP_EXPIRED");
 
      const valid = await compareOtp(input.code, attempt.otpCode);
      if (!valid) {
        const updated = await prisma.loginAttempt.update({
          where: { uuid: input.attemptUuid },
          data: { attempts: { increment: 1 } },
        });
 
        if (updated.attempts >= 5) {
          const targetUser = await prisma.user.findUnique({
            where: { phoneNumber: attempt.phoneNumber },
          });
          if (targetUser) {
            await FraudService.recordLoginBruteForce({
              userUuid: targetUser.uuid,
              tenantUuid: "SYSTEM",
              ipAddress: input.req.ip || "unknown",
              attemptUuid: attempt.uuid,
            });
          }
        }
        throw new Error("INVALID_OTP");
      }
 
      await prisma.loginAttempt.update({
        where: { uuid: input.attemptUuid },
        data: { used: true, usedAt: new Date(), success: true },
      });
 
      user = await prisma.user.findUnique({
        where: { phoneNumber: attempt.phoneNumber },
      });
    }
 
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
 
    const requires2FA = await TwoFactorService.isRequired(user.uuid);
    if (requires2FA) {
      return {
        requires2FA: true,
        tempToken: await this.createTempToken(user.uuid, "2FA_PENDING"),
        user: { uuid: user.uuid, name: user.name },
      };
    }
 
    return this.completeLogin(user, input.req);
  }
 
  static async loginWithPassword(input: {
    email?: string;
    phoneNumber?: string;
    password: string;
    req: any;
  }) {
    const bcrypt = await import("bcryptjs");
 
    const user = await prisma.user.findFirst({
      where: {
        ...(input.email ? { email: input.email.toLowerCase() } : {}),
        ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
        globalRole: { in: ["SUPER_ADMIN", "ADMIN"] },
      },
    });
 
    if (!user) throw new Error("INVALID_CREDENTIALS");
    if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("ACCOUNT_LOCKED");
 
    const passwordField = user.passwordHash || user.password;
    if (!passwordField) throw new Error("NO_PASSWORD_SET");
 
    const valid = await bcrypt.compare(input.password, passwordField);
    if (!valid) {
      const updated = await prisma.user.update({
        where: { uuid: user.uuid },
        data: { failedLoginAttempts: { increment: 1 } },
      });
 
      // Lock after 5 failed attempts (30 min)
      if (updated.failedLoginAttempts >= 5) {
        await prisma.user.update({
          where: { uuid: user.uuid },
          data: { lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
        });
      }
 
      throw new Error("INVALID_CREDENTIALS");
    }
 
    const requires2FA = await TwoFactorService.isRequired(user.uuid);
    if (requires2FA) {
      return {
        requires2FA: true,
        tempToken: await this.createTempToken(user.uuid, "2FA_PENDING"),
        user: { uuid: user.uuid, name: user.name },
      };
    }
 
    return this.completeLogin(user, input.req);
  }
 
  static async verify2FA(input: {
    tempToken: string;
    code: string;
    isBackupCode?: boolean;
    req: any;
  }) {
    const pending = await this.validateTempToken(input.tempToken, "2FA_PENDING");
    if (!pending) throw new Error("INVALID_TEMP_TOKEN");
 
    await TwoFactorService.verifyToken({
      userUuid: pending.userUuid,
      token: input.code,
      isBackupCode: input.isBackupCode,
    });
 
    const user = await prisma.user.findUnique({
      where: { uuid: pending.userUuid },
    });
    if (!user) throw new Error("USER_NOT_FOUND");
 
    // Clean up temp token immediately
    await redis.del(`auth:temp:${input.tempToken}`);
 
    return this.completeLogin(user, input.req);
  }
 
  private static async completeLogin(user: any, req: any) {
    await prisma.user.update({
      where: { uuid: user.uuid },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: req.ip,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
 
    // Get tenant context
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { userUuid: user.uuid, isActive: true },
      select: { tenantUuid: true },
    });
 
    const tokens = await TokenService.issueTokenPair({
      userUuid: user.uuid,
      tenantUuid: tenantUser?.tenantUuid,
      role: user.globalRole,
      req,
    });
 
    // Trust device
    const fingerprint =
      (req.headers["x-fingerprint"] as string) ||
      (req.headers["x-device-fingerprint"] as string);
 
    if (fingerprint) {
      await DeviceTrustService.trustDevice({
        userUuid: user.uuid,
        deviceFingerprint: fingerprint,
        deviceId: (req.headers["x-device-id"] as string) || "unknown",
        ipAddress: req.ip || "unknown",
        req,
      });
    }
 
    // Session risk analysis (async — don't block login)
    SessionRiskService.analyze({
      userUuid: user.uuid,
      tenantUuid: tenantUser?.tenantUuid || "SYSTEM",
      req,
    }).catch((err: any) => {
      logWithContext("error", "[Auth] Risk analysis failed", { error: err.message });
    });
 
    MetricsService.increment("auth.login.success", 1, { role: user.globalRole });
 
    return {
      user: {
        uuid: user.uuid,
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
        role: user.globalRole,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      requires2FA: false,
    };
  }
 
  private static async createTempToken(userUuid: string, purpose: string): Promise<string> {
    const token = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Upstash: redis.set with { ex: seconds }
    await redis.set(`auth:temp:${token}`, JSON.stringify({ userUuid, purpose }), { ex: 300 });
    return token;
  }
 
  private static async validateTempToken(
    token: string,
    expectedPurpose: string
  ): Promise<{ userUuid: string } | null> {
    const data = await redis.get(`auth:temp:${token}`);
    if (!data) return null;
    // Upstash returns parsed JSON for objects, raw string for strings
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    if (parsed.purpose !== expectedPurpose) return null;
    return parsed;
  }
}