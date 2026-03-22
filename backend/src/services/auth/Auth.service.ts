import type { Request} from "express";
import prisma from "../config/prisma.ts"
import { hashOtp, compareOtp, generateOtp, otpExpiry } from "./otp.service.ts";
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { EmailService } from "../email.service.ts";
import { SMSService } from "../notification/sms.service.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";
import { FraudSignalService } from "../fraud.service.ts";
import { TokenService } from "./Token.service.ts";
import { DeviceTrustService } from "../security/DeviceTrust.service.ts";
import { FraudService } from "../security/Fraud.service.ts";
import { TwoFactorService } from "./TwoFactor.service.ts";
import { SessionRiskService } from "../security/SessionRisk.service.ts";

export class AuthService {
  // FLOW 1: PHONE + OTP (Customers & Employees)

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
    firstName?: string;
    lastName?: string;
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
          name: input.name || `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() 
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

      // Generate tokens
      // const accessToken = signAccessToken({
      //   userUuid: verifiedUser.uuid,
      //   role: verifiedUser.globalRole,
      //   tokenVersion: verifiedUser.tokenVersion,
      // });

      // const refreshToken = signRefreshToken({
      //   userUuid: verifiedUser.uuid,
      //   tokenVersion: verifiedUser.tokenVersion,
      // });

      const tokens = await TokenService.issueTokenPair({
        userUuid: verifiedUser.uuid,
        role: verifiedUser.globalRole,
        req: input.req,
      });

      // // Store refresh token
      // const storedToken = await prisma.refreshToken.create({
      //   data: {
      //     token: refreshToken,
      //     userUuid: verifiedUser.uuid,
      //     deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
      //     deviceId: input.req.headers["x-device-id"] as string,
      //     issuedFrom: input.req.ip!,
      //     userAgent: input.req.headers["user-agent"],
      //     expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      //   },
      // });

      // Trust this device (first device is always trusted)
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

      // // Create session
      // await createUserSession(verifiedUser.uuid, storedToken.uuid, input.req);

      logWithContext("info", "[Auth] Signup verified successfully", {
        userUuid: verifiedUser.uuid,
      });

      MetricsService.increment("auth.signup.success", 1);

      return {
        user: verifiedUser,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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

      if (!user || !user.isVerified) throw new Error("USER_NOT_FOUND");
      if (user.isBanned || user.isGloballyBanned) throw new Error("ACCOUNT_BANNED");
      if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("ACCOUNT_LOCKED");

      // If the device is trusted, skip OTP entirely
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

      if (recentAttempts >= 10) throw new Error("RATE_LIMIT_EXCEEDED");
  
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
        skipOtp: false,
        attemptUuid: attempt.uuid,
        message: "OTP sent",
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
  // static async verifyLoginOtp(input: {
  //   attemptUuid?: string;
  //   code?: string;
  //   userUuid?: string;
  //   trustedDevice?: boolean;
  //   req: any;
  // }) {
  //   logWithContext("info", "[Auth] Verifying login OTP", {
  //     attemptUuid: input.attemptUuid,
  //   });

  //   try {
  //     let user: any;
 
  //     if (input.trustedDevice && input.userUuid) {
  //       // ── TRUSTED DEVICE PATH (no OTP needed) ───────────────────────
  //       user = await prisma.user.findUnique({
  //         where: { uuid: input.userUuid },
  //       });
  //       if (!user) throw new Error("USER_NOT_FOUND");
  //     } else {
  //       // ── STANDARD OTP PATH ─────────────────────────────────────────
  //       if (!input.attemptUuid || !input.code) {
  //         throw new Error("ATTEMPT_AND_CODE_REQUIRED");
  //       }
  //       const attempt = await prisma.loginAttempt.findUnique({
  //         where: { uuid: input.attemptUuid },
  //       });
  
  //       if (!attempt || attempt.used) throw new Error("INVALID_ATTEMPT");
  //       if (attempt.attempts >= 5) throw new Error("TOO_MANY_ATTEMPTS");
  //       if (attempt.expiresAt < new Date()) throw new Error("OTP_EXPIRED");
 
  //       const valid = await compareOtp(input.code, attempt.otpCode);
  //       if (!valid) {
  //         const updated = await prisma.loginAttempt.update({
  //           where: { uuid: input.attemptUuid },
  //           data: { attempts: { increment: 1 } },
  //         });
  
  //         if (updated.attempts >= 5) {
  //           const targetUser = await prisma.user.findUnique({
  //             where: { phoneNumber: attempt.phoneNumber },
  //           });
  //           if (targetUser) {
  //             await FraudService.recordLoginBruteForce({
  //               userUuid: targetUser.uuid,
  //               tenantUuid: "SYSTEM",
  //               ipAddress: input.req.ip || "unknown",
  //               attemptUuid: attempt.uuid,
  //             });
  //           }
  //         };
  //       throw new Error("INVALID_OTP");
  //     }

  //     // Mark attempt as used
  //     await prisma.loginAttempt.update({
  //       where: { uuid: input.attemptUuid },
  //       data: { used: true, usedAt: new Date(), success: true },
  //     });

  //     // Get user
  //     const user = await prisma.user.findUnique({
  //       where: { phoneNumber: attempt.phoneNumber },
  //     });

  //     if (!user) throw new Error("USER_NOT_FOUND");
  //     if (user.isBanned || user.isGloballyBanned) hrow new Error("ACCOUNT_BANNED");
  
  //     // Reset failed login attempts
  //     await prisma.user.update({
  //       where: { uuid: user.uuid },
  //       data: {
  //         failedLoginAttempts: 0,
  //         lockedUntil: null,
  //         lastLoginAt: new Date(),
  //         lastLoginIp: input.req.ip,
  //       },
  //     });

  //     // ── CHECK 2FA ───────────────────────────────────────────────────
  //     const requires2FA = await TwoFactorService.isRequired(user.uuid);
  //     if (requires2FA) {
  //       // Return a temporary token that only allows 2FA verification
  //       return {
  //         requires2FA: true,
  //         tempToken: await this.createTempToken(user.uuid, "2FA_PENDING"),
  //         user: { uuid: user.uuid, name: user.name },
  //       };
  //     };

  //     // ── ISSUE TOKENS
  //     return this.completeLogin(user, input.req);

  //     // // Generate tokens
  //     // const accessToken = signAccessToken({
  //     //   userUuid: user.uuid,
  //     //   role: user.globalRole,
  //     //   tokenVersion: user.tokenVersion,
  //     // });

  //     // const refreshToken = signRefreshToken({
  //     //   userUuid: user.uuid,
  //     //   tokenVersion: user.tokenVersion,
  //     // });

  //     // // Store refresh token
  //     // const storedToken = await prisma.refreshToken.create({
  //     //   data: {
  //     //     token: refreshToken,
  //     //     userUuid: user.uuid,
  //     //     deviceFingerprint: input.req.headers["x-device-fingerprint"] as string || "unknown",
  //     //     deviceId: input.req.headers["x-device-id"] as string,
  //     //     issuedFrom: input.req.ip!,
  //     //     userAgent: input.req.headers["user-agent"],
  //     //     expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  //     //   },
  //     // });

  //     // // Create session
  //     // await createUserSession(user.uuid, storedToken.uuid, input.req);

  //     logWithContext("info", "[Auth] Login successful", {
  //       userUuid: user.uuid,
  //     });

  //     MetricsService.increment("auth.login.success", 1);

  //     // return {
  //     //   user,
  //     //   accessToken,
  //     //   refreshToken,
  //     // };
  //   } catch (error: any) {
  //     logWithContext("error", "[Auth] Login verification failed", {
  //       error: error.message,
  //       attemptUuid: input.attemptUuid,
  //     });

  //     MetricsService.increment("auth.login.failed", 1);

  //     throw error;
  //   }
  // }

  static async verifyLoginOtp(input: {
    attemptUuid?: string;
    code?: string;
    userUuid?: string;     
    trustedDevice?: boolean;
    req: any;
  }) {
    let user: any;
 
    if (input.trustedDevice && input.userUuid) {
      user = await prisma.user.findUnique({
        where: { uuid: input.userUuid },
      });
      if (!user) throw new Error("USER_NOT_FOUND");
    } else {
      
      if (!input.attemptUuid || !input.code) {
        throw new Error("ATTEMPT_AND_CODE_REQUIRED");
      }
 
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
 
      // Mark attempt as used
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
 
    // ── CHECK 2FA ───────────────────────────────────────────────────
    const requires2FA = await TwoFactorService.isRequired(user.uuid);
    if (requires2FA) {
      // Return a temporary token that only allows 2FA verification
      return {
        requires2FA: true,
        tempToken: await this.createTempToken(user.uuid, "2FA_PENDING"),
        user: { uuid: user.uuid, name: user.name },
      };
    }
 
    // ── ISSUE TOKENS (the fix — all go through TokenService) ────────
    return this.completeLogin(user, input.req);
  }

  static async verify2FA(input: {
    tempToken: string;
    code: string;
    isBackupCode?: boolean;
    req: any;
  }) {
    // Validate temp token
    const pending = await this.validateTempToken(input.tempToken, "2FA_PENDING");
    if (!pending) throw new Error("INVALID_TEMP_TOKEN");
 
    // Verify 2FA code
    await TwoFactorService.verifyToken({
      userUuid: pending.userUuid,
      token: input.code,
      isBackupCode: input.isBackupCode,
    });
 
    const user = await prisma.user.findUnique({
      where: { uuid: pending.userUuid },
    });
 
    if (!user) throw new Error("USER_NOT_FOUND");
 
    // Clean up temp token
    await this.clearTempToken(pending.userUuid);
 
    return this.completeLogin(user, input.req);
  }
 
  // SHARED: Complete login (all flows converge here)
 
  private static async completeLogin(user: any, req: any) {
    // Update login tracking
    await prisma.user.update({
      where: { uuid: user.uuid },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: req.ip,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
 
    // Get tenant context (first active tenant)
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
 
    // Trust device on successful login
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
 
    // Analyze session risk (async — don't block login)
    SessionRiskService.analyze({
      userUuid: user.uuid,
      tenantUuid: tenantUser?.tenantUuid || "SYSTEM",
      req,
    }).catch((err) => {
      logWithContext("error", "[Auth] Risk analysis failed", { error: err.message });
    });
 
    MetricsService.increment("auth.login.success", 1, {
      role: user.globalRole,
    });
 
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
 
  // ── Temp token helpers (for 2FA pending state) ────────────────────────
  private static async createTempToken(userUuid: string, purpose: string): Promise<string> {
    const token = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Store in Redis with 5-minute TTL
    const { redis } = await import("../../lib/redis.ts");
    await redis.setex(`auth:temp:${token}`, 300, JSON.stringify({ userUuid, purpose }));
    return token;
  }
 
  private static async validateTempToken(
    token: string,
    expectedPurpose: string
  ): Promise<{ userUuid: string } | null> {
    const { redis } = await import("../../lib/redis.ts");
    const data = await redis.get(`auth:temp:${token}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.purpose !== expectedPurpose) return null;
    return parsed;
  }
 
  private static async clearTempToken(userUuid: string) {
    // Temp tokens auto-expire via Redis TTL
  }

  // //Analyze session risk
  // private static async analyzeSessionRisk(input: {
  //   userUuid: string;
  //   req: Request;
  // }) {
  //   const deviceFingerprint = input.req.headers["x-device-fingerprint"] as string;

  //   // Check if device is trusted
  //   const isTrusted = await DeviceTrustService.isTrustedDevice(
  //     input.userUuid,
  //     deviceFingerprint
  //   );

  //   // Count recent sessions
  //   const recentSessions = await prisma.session.count({
  //     where: {
  //       userUuid: input.userUuid,
  //       status: "ACTIVE",
  //       createdAt: {
  //         gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
  //       },
  //     },
  //   });

  //   // Count distinct devices in last 24 hours
  //   const distinctDevices = await prisma.session.groupBy({
  //     by: ["deviceFingerprint"],
  //     where: {
  //       userUuid: input.userUuid,
  //       createdAt: {
  //         gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
  //       },
  //     },
  //   });

  //   let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  //   let suspicionReason = "";

  //   if (!isTrusted && recentSessions > 3) {
  //     riskLevel = "MEDIUM";
  //     suspicionReason = "Rapid login from untrusted device";
  //   };

  //   if (!isTrusted && distinctDevices.length >= 4) {
  //     riskLevel = "HIGH";
  //     suspicionReason = "Multiple untrusted devices in 24 hours";
  //   };

  //   if (distinctDevices.length >= 8) {
  //     riskLevel = "CRITICAL";
  //     suspicionReason = "Excessive device count - possible account takeover";
  //   };

  //   // Update session risk
  //   if (riskLevel !== "LOW") {
  //     await prisma.session.updateMany({
  //       where: {
  //         userUuid: input.userUuid,
  //         createdAt: {
  //           gte: new Date(Date.now() - 60 * 1000), // Last minute
  //         },
  //       },
  //       data: {
  //         riskLevel,
  //         suspiciousActivity: true,
  //         suspicionReason,
  //       },
  //     });

  //     // Create fraud event
  //     await FraudService.recordSuspiciousLogin({
  //       userUuid: input.userUuid,
  //       riskLevel,
  //       reason: suspicionReason,
  //       ipAddress: input.req.ip!,
  //       deviceFingerprint,
  //     });
  //   };

  //   // Auto-revoke sessions if critical
  //   if (riskLevel === "CRITICAL") {
  //     await this.revokeAllSessions(input.userUuid);

  //     // Send alert to user
  //     // TODO: Send email/SMS alert
  //   };
  // }

  // //Revoke all user sessions
  // static async revokeAllSessions(userUuid: string) {
  //   await prisma.refreshToken.updateMany({
  //     where: {
  //       userUuid,
  //       status: "ACTIVE",
  //     },
  //     data: {
  //       status: "REVOKED",
  //       revoked: true,
  //       revokedAt: new Date(),
  //       revokedBy: "SYSTEM",
  //       revokedReason: "SUSPICIOUS_ACTIVITY",
  //     },
  //   });

  //   await prisma.session.updateMany({
  //     where: {
  //       userUuid,
  //       status: "ACTIVE",
  //     },
  //     data: {
  //       status: "REVOKED",
  //       revoked: true,
  //       revokedAt: new Date(),
  //       revokedBy: "SYSTEM",
  //       revokedReason: "Suspicious activity detected",
  //     },
  //   });

  //   logWithContext("warn", "[Auth] All sessions revoked", { userUuid });
  // }
}
  
  