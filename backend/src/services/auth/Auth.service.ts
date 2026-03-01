import type { Request} from "express";
import prisma from "../config/prisma.ts"
import { hashOtp, compareOtp, generateOtp, otpExpiry } from "./otp.service.ts";
import { createUserSession } from "./session.service.ts";
import { signAccessToken, signRefreshToken } from "../utils/jwt.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EmailService } from "../email.service.ts";
import { SMSService } from "../notification/sms.service.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { FraudSignalService } from "../fraud.service.ts";

export class AuthService {

  //Request signup OTP
  static async requestSignupOtp(input: {
    phoneNumber: string;
    method?: "SMS" | "EMAIL";
    email?: string;
  }) {

    logWithContext("info", "[Auth] Signup OTP requested", {
      phoneNumber: input.phoneNumber,
      method: input.method,
    });

    try {
      // Check if already registered
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber: input.phoneNumber },
      });

      if (existingUser?.isVerified) {
        throw new Error("PHONE_ALREADY_REGISTERED");
      }

      // Generate OTP
      const otp = generateOtp();
      const hashedOtp = await hashOtp(otp);

      // Update or create user
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
            email: input.email,
            otpCode: hashedOtp,
            otpExpiresAt: otpExpiry(),
            otpMethod: input.method || "SMS",
            globalRole: "CUSTOMER",
            isVerified: false,
          },
        });
      };

       // Send OTP
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
      };

      logWithContext("info", "[Auth] OTP sent successfully", {
        phoneNumber: input.phoneNumber,
        method: input.method || "SMS",
      });

      MetricsService.increment("auth.signup_otp.sent", 1);

      return { success: true };
    } catch (error: any) {
      logWithContext("error", "[Auth] Failed to send signup OTP", {
        error: error.message,
        phoneNumber: input.phoneNumber,
      });

      MetricsService.increment("auth.signup_otp.failed", 1);

      throw error;
    }
  }

  //Verify signup OTP
  static async verifySignup(input: {
    phoneNumber: string;
    code: string;
    name?: string;
    email?: string;
    req: Request;
  }) {
    logWithContext("info", "[Auth] Verifying signup OTP", {
      phoneNumber: input.phoneNumber,
    });

    try {
      const user = await prisma.user.findUnique({
        where: { phoneNumber: input.phoneNumber },
      });

      if (!user) {
        throw new Error("OTP_NOT_REQUESTED");
      }

      if (user.isVerified) {
        throw new Error("PHONE_ALREADY_REGISTERED");
      }

      if (user.otpAttempts >= 5) {
        // Record fraud event
        await FraudSignalService.recordOtpFraud({
          userUuid: user.uuid,
          ipAddress: input.req.ip!,
          reason: "Too many failed OTP attempts",
        });

        throw new Error("TOO_MANY_ATTEMPTS");
      };

      if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        throw new Error("OTP_EXPIRED");
      };

      // Verify OTP
      const valid = await compareOtp(input.code, user.otpCode!);

      if (!valid) {
        // Increment attempts
        await prisma.user.update({
          where: { phoneNumber: input.phoneNumber },
          data: { otpAttempts: { increment: 1 } },
        });

        throw new Error("INVALID_OTP");
      };

      // Update user as verified
      const verifiedUser = await prisma.user.update({
        where: { phoneNumber: input.phoneNumber },
        data: {
          name: input.name,
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

      // Generate tokens
      const accessToken = signAccessToken({
        userUuid: verifiedUser.uuid,
        role: verifiedUser.globalRole,
        tokenVersion: verifiedUser.tokenVersion,
      });

      const refreshToken = signRefreshToken({
        userUuid: verifiedUser.uuid,
        tokenVersion: verifiedUser.tokenVersion,
      });

      // Store refresh token
      const storedToken = await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userUuid: verifiedUser.uuid,
          deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
          deviceId: input.req.headers["x-device-id"] as string,
          issuedFrom: input.req.ip!,
          userAgent: input.req.headers["user-agent"],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Create session
      await createUserSession(verifiedUser.uuid, storedToken.uuid, input.req);

      // Mark device as trusted
      await DeviceTrustService.trustDevice({
        userUuid: verifiedUser.uuid,
        deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
        deviceId: input.req.headers["x-device-id"] as string || "unknown",
        ipAddress: input.req.ip!,
        req: input.req,
      });

      logWithContext("info", "[Auth] Signup verified successfully", {
        userUuid: verifiedUser.uuid,
      });

      MetricsService.increment("auth.signup.success", 1);

      return {
        user: verifiedUser,
        accessToken,
        refreshToken,
      };

    } catch (error: any) {
      logWithContext("error", "[Auth] Signup verification failed", {
        error: error.message,
        phoneNumber: input.phoneNumber,
      });

      MetricsService.increment("auth.signup.failed", 1);

      throw error;
    }
  }

  //Request login OTP
  static async requestLoginOtp(input: {
    phoneNumber: string;
    ipAddress: string;
    userAgent?: string;
    deviceFingerprint?: string;
  }) {
    logWithContext("info", "[Auth] Login OTP requested", {
      phoneNumber: input.phoneNumber,
    });

    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { phoneNumber: input.phoneNumber },
      });

      if (!user || !user.isVerified) {
        throw new Error("USER_NOT_FOUND");
      };

      if (user.isBanned || user.isGloballyBanned) {
        throw new Error("ACCOUNT_BANNED");
      };

      // Check account lockout
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new Error("ACCOUNT_LOCKED");
      };

      // Check rate limiting per IP
      const recentAttempts = await prisma.loginAttempt.count({
        where: {
          ipAddress: input.ipAddress,
          createdAt: {
            gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
          },
        },
      });

      if (recentAttempts >= 10) {
        throw new Error("RATE_LIMIT_EXCEEDED");
      };

      // Generate OTP
      const otp = generateOtp();
      const hashedOtp = await hashOtp(otp);

      // Create login attempt
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

      // Send OTP
      await SMSService.send({
        to: input.phoneNumber,
        message: `Your login code is: ${otp}. Valid for 5 minutes.`,
      });

      logWithContext("info", "[Auth] Login OTP sent", {
        phoneNumber: input.phoneNumber,
        attemptUuid: attempt.uuid,
      });

      MetricsService.increment("auth.login_otp.sent", 1);

      return {
        attemptUuid: attempt.uuid,
      };

    } catch (error: any) {
      logWithContext("error", "[Auth] Failed to send login OTP", {
        error: error.message,
        phoneNumber: input.phoneNumber,
      });

      MetricsService.increment("auth.login_otp.failed", 1);

      throw error;
    }
  }

  //Verify login OTP
  static async verifyLoginOtp(input: {
    attemptUuid: string;
    code: string;
    req: Request;
  }) {
    logWithContext("info", "[Auth] Verifying login OTP", {
      attemptUuid: input.attemptUuid,
    });

    try {
      const attempt = await prisma.loginAttempt.findUnique({
        where: { uuid: input.attemptUuid },
      });

      if (!attempt || attempt.used) {
        throw new Error("INVALID_ATTEMPT");
      };

      if (attempt.attempts >= 5) {
        throw new Error("TOO_MANY_ATTEMPTS");
      };

      if (attempt.expiresAt < new Date()) {
        throw new Error("OTP_EXPIRED");
      };

      // Verify OTP
      const valid = await compareOtp(input.code, attempt.otpCode);

      if (!valid) {
        // Increment attempts
        const updated = await prisma.loginAttempt.update({
          where: { uuid: input.attemptUuid },
          data: { attempts: { increment: 1 } },
        });

        // Check for brute force
        if (updated.attempts >= 5) {
          const user = await prisma.user.findUnique({
            where: { phoneNumber: attempt.phoneNumber },
          });

          if (user) {
            await FraudService.recordLoginBruteForce({
              userUuid: user.uuid,
              ipAddress: input.req.ip!,
              attemptUuid: attempt.uuid,
            });
          }
        }

        throw new Error("INVALID_OTP");
      }

      // Mark attempt as used
      await prisma.loginAttempt.update({
        where: { uuid: input.attemptUuid },
        data: {
          used: true,
          usedAt: new Date(),
          success: true,
        },
      });

      // Get user
      const user = await prisma.user.findUnique({
        where: { phoneNumber: attempt.phoneNumber },
      });

      if (!user || user.isBanned || user.isGloballyBanned) {
        throw new Error("ACCOUNT_BANNED");
      }

      // Reset failed login attempts
      await prisma.user.update({
        where: { uuid: user.uuid },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: input.req.ip,
        },
      });

      // Generate tokens
      const accessToken = signAccessToken({
        userUuid: user.uuid,
        role: user.globalRole,
        tokenVersion: user.tokenVersion,
      });

      const refreshToken = signRefreshToken({
        userUuid: user.uuid,
        tokenVersion: user.tokenVersion,
      });

      // Store refresh token
      const storedToken = await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userUuid: user.uuid,
          deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
          deviceId: input.req.headers["x-device-id"] as string,
          issuedFrom: input.req.ip!,
          userAgent: input.req.headers["user-agent"],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Create session
      await createUserSession(user.uuid, storedToken.uuid, input.req);

      // Analyze session risk
      await this.analyzeSessionRisk({
        userUuid: user.uuid,
        req: input.req,
      });

      logWithContext("info", "[Auth] Login successful", {
        userUuid: user.uuid,
      });

      MetricsService.increment("auth.login.success", 1);

      return {
        user,
        accessToken,
        refreshToken,
      };

    } catch (error: any) {
      logWithContext("error", "[Auth] Login verification failed", {
        error: error.message,
        attemptUuid: input.attemptUuid,
      });

      MetricsService.increment("auth.login.failed", 1);

      throw error;
    }
  }

  //Analyze session risk
  private static async analyzeSessionRisk(input: {
    userUuid: string;
    req: Request;
  }) {
    const deviceFingerprint = input.req.headers["x-device-fingerprint"] as string;

    // Check if device is trusted
    const isTrusted = await DeviceTrustService.isTrustedDevice(
      input.userUuid,
      deviceFingerprint
    );

    // Count recent sessions
    const recentSessions = await prisma.session.count({
      where: {
        userUuid: input.userUuid,
        status: "ACTIVE",
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
        },
      },
    });

    // Count distinct devices in last 24 hours
    const distinctDevices = await prisma.session.groupBy({
      by: ["deviceFingerprint"],
      where: {
        userUuid: input.userUuid,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    let suspicionReason = "";

    if (!isTrusted && recentSessions > 3) {
      riskLevel = "MEDIUM";
      suspicionReason = "Rapid login from untrusted device";
    };

    if (!isTrusted && distinctDevices.length >= 4) {
      riskLevel = "HIGH";
      suspicionReason = "Multiple untrusted devices in 24 hours";
    };

    if (distinctDevices.length >= 8) {
      riskLevel = "CRITICAL";
      suspicionReason = "Excessive device count - possible account takeover";
    };

    // Update session risk
    if (riskLevel !== "LOW") {
      await prisma.session.updateMany({
        where: {
          userUuid: input.userUuid,
          createdAt: {
            gte: new Date(Date.now() - 60 * 1000), // Last minute
          },
        },
        data: {
          riskLevel,
          suspiciousActivity: true,
          suspicionReason,
        },
      });

      // Create fraud event
      await FraudService.recordSuspiciousLogin({
        userUuid: input.userUuid,
        riskLevel,
        reason: suspicionReason,
        ipAddress: input.req.ip!,
        deviceFingerprint,
      });
    };

    // Auto-revoke sessions if critical
    if (riskLevel === "CRITICAL") {
      await this.revokeAllSessions(input.userUuid);

      // Send alert to user
      // TODO: Send email/SMS alert
    };
  }

  //Revoke all user sessions
  static async revokeAllSessions(userUuid: string) {
    await prisma.refreshToken.updateMany({
      where: {
        userUuid,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedBy: "SYSTEM",
        revokedReason: "SUSPICIOUS_ACTIVITY",
      },
    });

    await prisma.session.updateMany({
      where: {
        userUuid,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revoked: true,
        revokedAt: new Date(),
        revokedBy: "SYSTEM",
        revokedReason: "Suspicious activity detected",
      },
    });

    logWithContext("warn", "[Auth] All sessions revoked", { userUuid });
  }
}
  
  