import { Request } from "express";
import prisma from "../utils/prisma.ts";
import { hashOtp, compareOtp, generateOtp, otpExpiry } from "./otp.service.ts";
import { recordOtpFraud } from "./fraud.service.ts";
import { createUserSession } from "./session.service.ts";
import { signAccessToken, signRefreshToken, signJwt } from "./token.service.ts";
import { evaluateAutoBan } from "../security/fraud.engine.ts";
import { analyzeSessionRisk } from "./security/analyzeSessionRisk.service.ts";

export const requestSignupOtpService = async (phoneNumber: string) => {
    const existingUser = await prisma.user.findUnique({ where: { phoneNumber } });
  
    if (existingUser?.isVerified) {
      throw new Error("Phone number already registered");
    }
  
    const otp = generateOtp();
  
    if (existingUser) {
      await prisma.user.update({
        where: { phoneNumber },
        data: {
          otpCode: await hashOtp(otp),
          otpExpiresAt: otpExpiry(),
        },
      });
    } else {
      await prisma.user.create({
        data: {
          phoneNumber,
          otpCode: await hashOtp(otp),
          otpExpiresAt: otpExpiry(),
          role: "CUSTOMER",
          isVerified: false,
        },
      });
    }
  
    console.log(`OTP for ${phoneNumber}: ${otp}`);
};

export const verifySignupService = async (
    req: Request,
    data: { phoneNumber: string; code: string; name?: string; email?: string }
  ) => {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: data.phoneNumber },
    });
  
    if (!user) throw new Error("OTP not requested");
    if (user.isVerified) throw new Error("Phone already registered");
    if (user.otpAttempts >= 5) throw new Error("Too many attempts");
    if (!user.otpExpiresAt || user.otpExpiresAt < new Date())
      throw new Error("Code expired");
  
    const valid = await compareOtp(data.code, user.otpCode!);
  
    if (!valid) {
      const updated = await prisma.user.update({
        where: { phoneNumber: data.phoneNumber },
        data: { otpAttempts: { increment: 1 } },
      });
  
      if (updated.otpAttempts >= 5) {
        await recordOtpFraud({
          userUuid: updated.uuid,
          ipAddress: req.ip,
        });
      }
  
      throw new Error("Invalid code");
    }
  
    const verifiedUser = await prisma.user.update({
      where: { phoneNumber: data.phoneNumber },
      data: {
        name: data.name,
        email: data.email?.toLowerCase(),
        isVerified: true,
        otpCode: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    });
  
    const accessToken = signAccessToken({
      userUuid: verifiedUser.uuid,
      role: verifiedUser.role,
      tokenVersion: verifiedUser.tokenVersion,
    });
  
    const refreshToken = signRefreshToken({
      userUuid: verifiedUser.uuid,
      tokenVersion: verifiedUser.tokenVersion,
    });
  
    const storedToken = await prisma.refreshToken.create({
      data: { token: refreshToken, userUuid: verifiedUser.uuid },
    });
  
    // res.clearCookie("signup_otp");

    await createUserSession(verifiedUser.uuid, storedToken.uuid, req);
  

    return { verifiedUser, accessToken, refreshToken };
};

export const requestLoginOtpService = async (phoneNumber: string) => {
    if (!phoneNumber) {
      throw new Error("phoneNumber is required");
    }
  
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user || !user.isVerified) {
      throw new Error("User not found");
    }
  
    const otp = generateOtp();
  
    const attempt = await prisma.loginAttempt.create({
      data: {
        phoneNumber,
        otpCode: await hashOtp(otp),
        expiresAt: otpExpiry(),
      },
    });
  
    console.log(`Login OTP for ${phoneNumber}: ${otp}`);
    return attempt;
};

export const verifyLoginOtpService = async (
    code: string,
    attemptUuid: string,
    req: any
  ) => {
    const attempt = await prisma.loginAttempt.findUnique({
      where: { uuid: attemptUuid },
    });
  
    if (!attempt || attempt.used) {
      throw new Error("Invalid OTP");
    }
  
    if (attempt.attempts >= 5) {
      throw new Error("Too many attempts");
    }
  
    if (attempt.expiresAt < new Date()) {
      throw new Error("OTP expired");
    }
  
    const isValid = await compareOtp(code, attempt.otpCode!);
  
    if (!isValid) {
      const updated = await prisma.loginAttempt.update({
        where: { uuid: attemptUuid },
        data: { attempts: { increment: 1 } },
      });
  
      if (updated.attempts >= 5) {
        const user = await prisma.user.findUnique({
          where: { phoneNumber: attempt.phoneNumber },
          select: { uuid: true },
        });
  
        if (user) {
          await prisma.fraudEvent.create({
            data: {
              userUuid: user.uuid,
              ipAddress: req.ip,
              reason: "Too many OTP attempts",
              severity: "HIGH",
            },
          });
  
          await prisma.adminAlert.create({
            data: {
              type: "SECURITY",
              message: `User ${user.uuid} triggered OTP brute-force protection`,
            },
          });
  
          await evaluateAutoBan(user.uuid);
        }
      }
  
      throw new Error("Invalid code");
    }
  
    await prisma.loginAttempt.update({
      where: { uuid: attemptUuid },
      data: { used: true },
    });
  
    const user = await prisma.user.findUnique({
      where: { phoneNumber: attempt.phoneNumber },
    });
  
    if (!user || user.banned) {
      throw new Error("Account blocked");
    }
  
    const accessToken = signAccessToken({
      userUuid: user.uuid,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
  
    const refreshToken = signRefreshToken({
      userUuid: user.uuid,
      tokenVersion: user.tokenVersion,
    });
  
    const storedRefreshToken = await prisma.refreshToken.create({
      data: { token: refreshToken, userUuid: user.uuid },
    });
  
    await createUserSession(user.uuid, storedRefreshToken.uuid, req);

    await analyzeSessionRisk(user.uuid, req);
  
    // res.clearCookie("login_attempt");
    return { user, accessToken, refreshToken };
};

export const completeProfileService = async (
    userUuid: string,
    name?: string,
    email?: string
  ) => {
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.uuid !== userUuid) {
        throw new Error("Email already in use");
      }
    }
  
    return prisma.user.update({
      where: { uuid: userUuid },
      data: { name, email },
      select: {
        uuid: true,
        phoneNumber: true,
        name: true,
        email: true,
        role: true,
      },
    });
};

export const getMeService = async (userUuid: string, storeUuid?: string) => {
    return prisma.user.findUnique({
      where: { uuid: userUuid },
      include: {
        userStores: storeUuid
          ? {
              where: { storeUuid },
              include: { store: true },
            }
          : undefined,
      },
    });
};

export const resendLoginOtpService = async (phoneNumber: string) => {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) throw new Error("User not found");
  
    await prisma.loginAttempt.updateMany({
      where: { phoneNumber, used: false },
      data: { used: true },
    });
  
    const otp = generateOtp();
  
    await prisma.loginAttempt.create({
      data: {
        phoneNumber,
        otpCode: await hashOtp(otp),
        expiresAt: otpExpiry(),
      },
    });
  
    console.log(`Resent OTP for ${phoneNumber}: ${otp}`);
};

export const selectStoreService = async (
    userUuid: string,
    storeUuid: string,
    role: string
  ) => {
    const membership = await prisma.userStore.findFirst({
      where: { userUuid, storeUuid },
    });
  
    if (!membership) {
      throw new Error("Not a member of this store");
    }
  
    return signJwt({
      userUuid,
      role,
      storeUuid,
    });
};
  
  