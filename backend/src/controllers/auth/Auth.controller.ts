import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { AuthService } from "../../services/auth/Auth.service.ts";
import { SessionService } from "../../services/auth/Session.service.ts";
import { TokenService } from "../../services/auth/Token.service.ts";
import { DeviceTrustService } from "../../services/security/DeviceTrust.service.js";
import { requestLoginOtpSchema, verifyLoginOtpSchema } from "../../validators/auth.validator.js";
import { verifySignupSchema } from "../../validators/auth.validator.js";
import { requestSignupOtpSchema } from "../../validators/auth.validator.js";
import { FraudService } from "../../services/security/Fraud.service.js";
import { BiometricAuthService } from "../../services/auth/BiometricAuth.service.js";
import { SocialAuthService } from "../../services/auth/SocialAuth.service.js";

function handleAuthError(error: any, res: Response, defaultMsg: string) {
  const map: Record<string, { status: number }> = {
    PHONE_ALREADY_REGISTERED: { status: 409 },
    USER_NOT_FOUND:           { status: 404 },
    ACCOUNT_BANNED:           { status: 403 },
    ACCOUNT_LOCKED:           { status: 403 },
    RATE_LIMIT_EXCEEDED:      { status: 429 },
    TOO_MANY_ATTEMPTS:        { status: 429 },
    OTP_NOT_REQUESTED:        { status: 400 },
    OTP_EXPIRED:              { status: 400 },
    INVALID_OTP:              { status: 400 },
    INVALID_ATTEMPT:          { status: 400 },
    INVALID_CREDENTIALS:      { status: 401 },
    INVALID_GOOGLE_TOKEN:     { status: 401 },
    INVALID_APPLE_TOKEN:      { status: 401 },
    INVALID_BIOMETRIC_TOKEN:  { status: 401 },
    INVALID_TEMP_TOKEN:       { status: 401 },
    INVALID_2FA_TOKEN:        { status: 401 },
    TOKEN_REUSE_DETECTED:     { status: 401 },
    TOKEN_EXPIRED:            { status: 401 },
    TOKEN_NOT_FOUND:          { status: 401 },
    NO_PASSWORD_SET:          { status: 400 },
  };
 
  const mapped = map[error.message];
  if (mapped) {
    return res.status(mapped.status).json({ success: false, error: error.message });
  }
 
  logWithContext("error", `[AuthCtrl] ${defaultMsg}`, { error: error.message });
  return res.status(500).json({ success: false, error: "INTERNAL_ERROR" });
}
 
function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}
 
export class AuthController {
    // POST /auth/signup/request-otp
    static async requestSignupOtp(req: Request, res: Response) {
        try {
            const { phoneNumber, method, email } = req.body;
            if (!phoneNumber) return res.status(400).json({ success: false, error: "PHONE_REQUIRED" });
            await AuthService.requestSignupOtp({ phoneNumber, method, email });
            return res.status(200).json({ success: true, message: "OTP sent" });
        } catch (e: any) { return handleAuthError(e, res, "requestSignupOtp"); }
    }
 
    // POST /auth/signup/verify
    static async verifySignup(req: Request, res: Response) {
        try {
            const { phoneNumber, code, name, firstName, lastName, email } = req.body;
            if (!phoneNumber || !code) return res.status(400).json({ success: false, error: "PHONE_AND_CODE_REQUIRED" });
            const result = await AuthService.verifySignup({ phoneNumber, code, name, firstName, lastName, email, req });
            setRefreshCookie(res, result.refreshToken);
            return res.status(201).json({ success: true, user: result.user, accessToken: result.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "verifySignup"); }
    }
 
    // POST /auth/login/request-otp
    static async requestLoginOtp(req: Request, res: Response) {
        try {
            const { phoneNumber } = req.body;
            if (!phoneNumber) return res.status(400).json({ success: false, error: "PHONE_REQUIRED" });
            const result = await AuthService.requestLoginOtp({
                phoneNumber,
                ipAddress: req.ip || "unknown",
                userAgent: req.headers["user-agent"],
                deviceFingerprint: (req.headers["x-fingerprint"] || req.headers["x-device-fingerprint"]) as string,
            });
        
            return res.status(200).json({
                success: true,
                skipOtp: result.skipOtp,
                ...(result.skipOtp ? { userUuid: result.userUuid } : { attemptUuid: result.attemptUuid }),
                message: result.message,
            });
        } catch (e: any) { return handleAuthError(e, res, "requestLoginOtp"); }
    }
 
    // POST /auth/login/verify
    static async verifyLoginOtp(req: Request, res: Response) {
        try {
            const { attemptUuid, code, userUuid, trustedDevice } = req.body;
            const result = await AuthService.verifyLoginOtp({ attemptUuid, code, userUuid, trustedDevice, req });
        
            if (result.requires2FA) {
                return res.status(200).json({ success: true, requires2FA: true, tempToken: result.tempToken, user: result.user });
            }
        
            setRefreshCookie(res, result.refreshToken);
            return res.status(200).json({ success: true, user: result.user, accessToken: result.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "verifyLoginOtp"); }
    }
    
    // POST /auth/login/password (Admin/SuperAdmin only)
    static async loginWithPassword(req: Request, res: Response) {
        try {
        const { email, phoneNumber, password } = req.body;
        if (!password || (!email && !phoneNumber)) return res.status(400).json({ success: false, error: "CREDENTIALS_REQUIRED" });
        const result = await AuthService.loginWithPassword({ email, phoneNumber, password, req });
    
        if (result.requires2FA) {
            return res.status(200).json({ success: true, requires2FA: true, tempToken: result.tempToken, user: result.user });
        }
    
        setRefreshCookie(res, result.refreshToken);
        return res.status(200).json({ success: true, user: result.user, accessToken: result.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "loginWithPassword"); }
    }
    
    // POST /auth/login/2fa
    static async verify2FA(req: Request, res: Response) {
        try {
            const { tempToken, code, isBackupCode } = req.body;
            if (!tempToken || !code) return res.status(400).json({ success: false, error: "TOKEN_AND_CODE_REQUIRED" });
            const result = await AuthService.verify2FA({ tempToken, code, isBackupCode, req });
            setRefreshCookie(res, result.refreshToken);
            return res.status(200).json({ success: true, user: result.user, accessToken: result.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "verify2FA"); }
    }
    
    // POST /auth/login/biometric
    static async loginWithBiometric(req: Request, res: Response) {
        try {
            const { deviceId, biometricToken } = req.body;
            if (!deviceId || !biometricToken) return res.status(400).json({ success: false, error: "DEVICE_AND_TOKEN_REQUIRED" });
            const result = await BiometricAuthService.authenticate({ deviceId, biometricToken, req });
            setRefreshCookie(res, result.refreshToken);
            return res.status(200).json({ success: true, user: result.user, accessToken: result.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "biometric login"); }
    }
 
    // POST /auth/login/google
    static async loginWithGoogle(req: Request, res: Response) {
        try {
            const { idToken } = req.body;
            if (!idToken) return res.status(400).json({ success: false, error: "ID_TOKEN_REQUIRED" });
            const result = await SocialAuthService.authenticateWithGoogle({ idToken, req });
            setRefreshCookie(res, result.refreshToken);
            return res.status(result.isNewUser ? 201 : 200).json({ success: true, user: result.user, accessToken: result.accessToken, isNewUser: result.isNewUser });
        } catch (e: any) { return handleAuthError(e, res, "Google login"); }
    }
    
    // POST /auth/login/apple
    static async loginWithApple(req: Request, res: Response) {
        try {
            const { identityToken, authorizationCode, user } = req.body;
            if (!identityToken) return res.status(400).json({ success: false, error: "TOKEN_REQUIRED" });
            const result = await SocialAuthService.authenticateWithApple({ identityToken, authorizationCode, user, req });
            setRefreshCookie(res, result.refreshToken);
            return res.status(result.isNewUser ? 201 : 200).json({ success: true, user: result.user, accessToken: result.accessToken, isNewUser: result.isNewUser });
        } catch (e: any) { return handleAuthError(e, res, "Apple login"); }
    }
    
    // POST /auth/token/rotate
    static async rotateToken(req: Request, res: Response) {
        try {
            const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
            if (!refreshToken) return res.status(400).json({ success: false, error: "REFRESH_TOKEN_REQUIRED" });
            const result = await TokenService.rotate(refreshToken, req);
            setRefreshCookie(res, result.refreshToken);
            return res.status(200).json({ success: true, accessToken: result.accessToken, refreshToken: result.refreshToken });
        } catch (e: any) { res.clearCookie("refreshToken"); return handleAuthError(e, res, "token rotation"); }
    }
    
    // POST /auth/logout
    static async logout(req: Request, res: Response) {
        try {
            const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
            if (refreshToken) await SessionService.logoutByToken(refreshToken);
        } catch { /* always succeed */ }
        res.clearCookie("refreshToken");
        return res.status(200).json({ success: true, message: "Logged out" });
    }
    
    // POST /auth/logout/all
    static async logoutAll(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            await TokenService.revokeAllForUser(user.uuid, "USER_LOGOUT");
            res.clearCookie("refreshToken");
            return res.status(200).json({ success: true, message: "All sessions revoked" });
        } catch (e: any) { return res.status(500).json({ success: false, error: "LOGOUT_FAILED" }); }
    }
 
    // GET /auth/sessions
    static async listSessions(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            const sessions = await SessionService.listActive(user.uuid);
            return res.status(200).json({ success: true, data: sessions });
        } catch { return res.status(500).json({ success: false, error: "FETCH_FAILED" }); }
    }
    
    // POST /auth/sessions/:uuid/revoke
    static async revokeSession(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            const session = await prisma.session.findFirst({ where: { uuid: req.params.sessionUuid, userUuid: user.uuid } });
            if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" });
            await prisma.session.update({ where: { uuid: session.uuid }, data: { status: "REVOKED", revoked: true, revokedAt: new Date(), revokedBy: user.uuid } });
            await prisma.refreshToken.update({ where: { uuid: session.refreshTokenUuid }, data: { status: "REVOKED", revoked: true, revokedAt: new Date(), revokedReason: "USER_LOGOUT" } });
            return res.status(200).json({ success: true, message: "Session revoked" });
        } catch { return res.status(500).json({ success: false, error: "REVOKE_FAILED" }); }
    }
    
    // POST /auth/password/change
    static async changePassword(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ success: false, error: "INVALID_INPUT" });
        
            const dbUser = await prisma.user.findUnique({ where: { uuid: user.uuid }, select: { passwordHash: true, password: true } });
            const passField = dbUser?.passwordHash || dbUser?.password;
            if (!passField) return res.status(400).json({ success: false, error: "NO_PASSWORD_SET" });
        
            const bcrypt = await import("bcryptjs");
            if (!(await bcrypt.compare(currentPassword, passField))) return res.status(401).json({ success: false, error: "INVALID_CURRENT_PASSWORD" });
        
            await prisma.user.update({ where: { uuid: user.uuid }, data: { passwordHash: await bcrypt.hash(newPassword, 12), failedLoginAttempts: 0, lockedUntil: null, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } } });
            await TokenService.revokeAllForUser(user.uuid, "PASSWORD_CHANGED");
        
            const tokens = await TokenService.issueTokenPair({ userUuid: user.uuid, tenantUuid: user.tenantUuid, role: user.role, req });
            setRefreshCookie(res, tokens.refreshToken);
            return res.status(200).json({ success: true, message: "Password changed", accessToken: tokens.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "changePassword"); }
    }
    
    // GET /auth/me
    static async me(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
        
            const dbUser = await prisma.user.findUnique({
                where: { uuid: user.uuid },
                select: {
                    uuid: true, phoneNumber: true, email: true, name: true, firstName: true, lastName: true,
                    globalRole: true, isVerified: true, emailVerified: true, createdAt: true,
                    admin2FA: { select: { enabled: true } },
                    tenantUsers: { where: { isActive: true }, include: { tenant: { select: { uuid: true, name: true, slug: true } } } },
                },
            });
        
            if (!dbUser) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });
        
            return res.status(200).json({ success: true, data: { ...dbUser, has2FA: dbUser.admin2FA?.enabled ?? false, admin2FA: undefined } });
        } catch { return res.status(500).json({ success: false, error: "FETCH_FAILED" }); }
    }
}

// export class AuthController {
  
//     //POST /auth/signup/request-otp
//     //Request OTP for signup
//     static async requestSignupOtp(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;

//         try {
//             // Validate input
//             const validation = requestSignupOtpSchema.safeParse(req.body);
//             if (!validation.success) {
//                 return res.status(400).json({
//                     error: "VALIDATION_ERROR",
//                     details: validation.error.errors,
//                 });
//             }

//             const { phoneNumber, method, email } = validation.data;

//             await AuthService.requestSignupOtp({
//                 phoneNumber,
//                 method,
//                 email,
//             });

//             logWithContext("info", "[Auth] Signup OTP requested", {
//                 traceId,
//                 phoneNumber,
//             });

//             return res.status(200).json({
//                 success: true,
//                 message: "OTP sent successfully",
//             });
//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to request signup OTP", {
//                 traceId,
//                 error: error.message,
//             });
        
//             if (error.message === "PHONE_ALREADY_REGISTERED") {
//                 return res.status(409).json({
//                     error: "PHONE_ALREADY_REGISTERED",
//                     message: "This phone number is already registered",
//                 });
//             };
        
//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to send OTP",
//             });
//         }
//     } 

//     //POST /auth/signup/verify
//     //Verify signup OTP and complete registration
//     static async verifySignup(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;

//         try {
//             // Validate input
//             const validation = verifySignupSchema.safeParse(req.body);
//             if (!validation.success) {
//                 return res.status(400).json({
//                     error: "VALIDATION_ERROR",
//                     details: validation.error.errors,
//                 });
//             };

//             const { phoneNumber, code, name, email } = validation.data;

//             const result = await AuthService.verifySignup({
//                 phoneNumber,
//                 code,
//                 name,
//                 email,
//                 req,
//             });

//             logWithContext("info", "[Auth] Signup verified", {
//                 traceId,
//                 userUuid: result.user.uuid,
//             });

//             // Set refresh token in httpOnly cookie
//             res.cookie("refreshToken", result.refreshToken, {
//                 httpOnly: true,
//                 secure: process.env.NODE_ENV === "production",
//                 sameSite: "strict",
//                 maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//             });

//             return res.status(201).json({
//                 success: true,
//                 user: {
//                     uuid: result.user.uuid,
//                     phoneNumber: result.user.phoneNumber,
//                     name: result.user.name,
//                     email: result.user.email,
//                     role: result.user.globalRole,
//                 },
//                 accessToken: result.accessToken,
//             });
//         } catch (error: any) {
//             logWithContext("error", "[Auth] Signup verification failed", {
//                 traceId,
//                 error: error.message,
//             });
        
//             const errorMap: Record<string, { status: number; error: string; message: string }> = {
//                 OTP_NOT_REQUESTED: {
//                     status: 400,
//                     error: "OTP_NOT_REQUESTED",
//                     message: "Please request OTP first",
//                 },
//                 PHONE_ALREADY_REGISTERED: {
//                     status: 409,
//                     error: "PHONE_ALREADY_REGISTERED",
//                     message: "This phone number is already registered",
//                 },
//                 TOO_MANY_ATTEMPTS: {
//                     status: 429,
//                     error: "TOO_MANY_ATTEMPTS",
//                     message: "Too many attempts. Please try again later.",
//                 },
//                 OTP_EXPIRED: {
//                     status: 400,
//                     error: "OTP_EXPIRED",
//                     message: "OTP has expired. Please request a new one.",
//                 },
//                 INVALID_OTP: {
//                     status: 400,
//                     error: "INVALID_OTP",
//                     message: "Invalid OTP code",
//                 },
//             };
        
//             const errorResponse = errorMap[error.message] || {
//                 status: 500,
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Signup verification failed",
//             };
        
//             return res.status(errorResponse.status).json(errorResponse);
//         }
//     }
     
//     //POST /auth/login/request-otp
//     //Request OTP for login
//     static async requestLoginOtp(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
    
//         try {
//             // Validate input
//             const validation = requestLoginOtpSchema.safeParse(req.body);
//             if (!validation.success) {
//                 return res.status(400).json({
//                     error: "VALIDATION_ERROR",
//                     details: validation.error.errors,
//                 });
//             }

//             const { phoneNumber } = validation.data;

//             const result = await AuthService.requestLoginOtp({
//                 phoneNumber,
//                 ipAddress: req.ip!,
//                 userAgent: req.headers["user-agent"],
//                 deviceFingerprint: req.headers["x-device-fingerprint"] as string,
//             });

//             logWithContext("info", "[Auth] Login OTP requested", {
//                 traceId,
//                 phoneNumber,
//             });

//             return res.status(200).json({
//                 success: true,
//                 attemptUuid: result.attemptUuid,
//                 message: "OTP sent successfully",
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to request login OTP", {
//                 traceId,
//                 error: error.message,
//             });

//             const errorMap: Record<string, { status: number; error: string; message: string }> = {
//                 USER_NOT_FOUND: {
//                     status: 404,
//                     error: "USER_NOT_FOUND",
//                     message: "User not found",
//                 },
//                 ACCOUNT_BANNED: {
//                     status: 403,
//                     error: "ACCOUNT_BANNED",
//                     message: "Your account has been banned",
//                 },
//                 ACCOUNT_LOCKED: {
//                     status: 403,
//                     error: "ACCOUNT_LOCKED",
//                     message: "Account temporarily locked. Please try again later.",
//                 },
//                 RATE_LIMIT_EXCEEDED: {
//                     status: 429,
//                     error: "RATE_LIMIT_EXCEEDED",
//                     message: "Too many attempts. Please try again later.",
//                 },
//             };

//             const errorResponse = errorMap[error.message] || {
//                 status: 500,
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to send OTP",
//             };

//             return res.status(errorResponse.status).json(errorResponse);
//         }
//     }

//     //POST /auth/login/verify
//     //Verify login OTP
   
//     static async verifyLoginOtp(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             // Validate input
//             const validation = verifyLoginOtpSchema.safeParse(req.body);
//             if (!validation.success) {
//                 return res.status(400).json({
//                     error: "VALIDATION_ERROR",
//                     details: validation.error.errors,
//                 });
//             }

//             const { attemptUuid, code } = validation.data;

//             const result = await AuthService.verifyLoginOtp({
//                 attemptUuid,
//                 code,
//                 req,
//             });

//             logWithContext("info", "[Auth] Login verified", {
//                 traceId,
//                 userUuid: result.user.uuid,
//             });

//             // Set refresh token in httpOnly cookie
//             res.cookie("refreshToken", result.refreshToken, {
//                 httpOnly: true,
//                 secure: process.env.NODE_ENV === "production",
//                 sameSite: "strict",
//                 maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//             });

//             return res.status(200).json({
//                 success: true,
//                 user: {
//                     uuid: result.user.uuid,
//                     phoneNumber: result.user.phoneNumber,
//                     name: result.user.name,
//                     email: result.user.email,
//                     role: result.user.globalRole,
//                 },
//                 accessToken: result.accessToken,
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Login verification failed", {
//                 traceId,
//                 error: error.message,
//             });

//             const errorMap: Record<string, { status: number; error: string; message: string }> = {
//                 INVALID_ATTEMPT: {
//                     status: 400,
//                     error: "INVALID_ATTEMPT",
//                     message: "Invalid or expired attempt",
//                 },
//                 TOO_MANY_ATTEMPTS: {
//                     status: 429,
//                     error: "TOO_MANY_ATTEMPTS",
//                     message: "Too many attempts. Please try again later.",
//                 },
//                 OTP_EXPIRED: {
//                     status: 400,
//                     error: "OTP_EXPIRED",
//                     message: "OTP has expired. Please request a new one.",
//                 },
//                 INVALID_OTP: {
//                     status: 400,
//                     error: "INVALID_OTP",
//                     message: "Invalid OTP code",
//                 },
//                 ACCOUNT_BANNED: {
//                     status: 403,
//                     error: "ACCOUNT_BANNED",
//                     message: "Your account has been banned",
//                 },
//             };

//             const errorResponse = errorMap[error.message] || {
//                 status: 500,
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Login verification failed",
//             };

//             return res.status(errorResponse.status).json(errorResponse);
//         }
//     }

//     //POST /auth/refresh
//     //Refresh access token
//     static async refreshToken(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             // Get refresh token from cookie or body
//             const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

//             if (!refreshToken) {
//                 return res.status(401).json({
//                     error: "NO_REFRESH_TOKEN",
//                     message: "Refresh token required",
//                 });
//             }

//             const result = await TokenService.rotateRefreshToken({
//                 token: refreshToken,
//                 req,
//             });

//             logWithContext("info", "[Auth] Token refreshed", {
//                 traceId,
//                 userUuid: result.user.uuid,
//             });

//             // Set new refresh token in cookie
//             res.cookie("refreshToken", result.refreshToken, {
//                 httpOnly: true,
//                 secure: process.env.NODE_ENV === "production",
//                 sameSite: "strict",
//                 maxAge: 30 * 24 * 60 * 60 * 1000,
//             });

//             return res.status(200).json({
//                 success: true,
//                 accessToken: result.accessToken,
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Token refresh failed", {
//                 traceId,
//                 error: error.message,
//             });

//             const errorMap: Record<string, { status: number; error: string; message: string }> = {
//                 TOKEN_NOT_FOUND: {
//                     status: 401,
//                     error: "TOKEN_NOT_FOUND",
//                     message: "Invalid refresh token",
//                 },
//                 TOKEN_REUSED: {
//                     status: 401,
//                     error: "TOKEN_REUSED",
//                     message: "Token reuse detected. Please login again.",
//                 },
//                 TOKEN_VERSION_MISMATCH: {
//                     status: 401,
//                     error: "TOKEN_VERSION_MISMATCH",
//                     message: "Token version mismatch. Please login again.",
//                 },
//                 ACCOUNT_BANNED: {
//                     status: 403,
//                     error: "ACCOUNT_BANNED",
//                     message: "Your account has been banned",
//                 },
//             };

//             const errorResponse = errorMap[error.message] || {
//                 status: 500,
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Token refresh failed",
//             };

//             // Clear refresh token cookie on error
//             res.clearCookie("refreshToken");

//             return res.status(errorResponse.status).json(errorResponse);
//         }
//     }

//     //POST /auth/logout
//     //Logout current session
//     static async logout(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

//             if (refreshToken) {
//                 const session = await SessionService.getSessionByRefreshToken(refreshToken);

//                 if (session) {
//                     await SessionService.revokeSession({
//                         sessionUuid: session.uuid,
//                         revokedBy: req.user?.uuid || "USER",
//                         reason: "User logout",
//                     });
//                 }
//             };

//             // Clear cookie
//             res.clearCookie("refreshToken");

//             logWithContext("info", "[Auth] User logged out", {
//                 traceId,
//                 userUuid: req.user?.uuid,
//             });

//             return res.status(200).json({
//                 success: true,
//                 message: "Logged out successfully",
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Logout failed", {
//                 traceId,
//                 error: error.message,
//             });

//             // Clear cookie anyway
//             res.clearCookie("refreshToken");

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Logout failed",
//             });
//         }
//     }

//     //POST /auth/logout-all
//     //Logout all sessions
//     static async logoutAll(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const userUuid = req.user!.uuid;

//             await SessionService.revokeAllSessions({
//                 userUuid,
//                 revokedBy: userUuid,
//                 reason: "User logged out all sessions",
//             });

//             // Clear cookie
//             res.clearCookie("refreshToken");

//             logWithContext("info", "[Auth] All sessions logged out", {
//                 traceId,
//                 userUuid,
//             });

//             return res.status(200).json({
//                 success: true,
//                 message: "All sessions logged out successfully",
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Logout all failed", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Logout all sessions failed",
//             });
//         }
//     }

//     //GET /auth/me
//     //Get current user
//     static async getMe(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const userUuid = req.user!.uuid;

//             const user = await prisma.user.findUnique({
//                 where: { uuid: userUuid },
//                 select: {
//                     uuid: true,
//                     phoneNumber: true,
//                     email: true,
//                     name: true,
//                     globalRole: true,
//                     isVerified: true,
//                     createdAt: true,
//                     tenantUsers: {
//                         where: { isActive: true },
//                         include: {
//                             tenant: {
//                                 select: {
//                                     uuid: true,
//                                     name: true,
//                                     slug: true,
//                                 },
//                             },
//                         },
//                     },
//                 },
//             });

//             if (!user) {
//                 return res.status(404).json({
//                     error: "USER_NOT_FOUND",
//                     message: "User not found",
//                 });
//             }

//             return res.status(200).json({
//                 success: true,
//                 user,
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to get user", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to retrieve user",
//             });
//         }
//     }

//     //GET /auth/sessions
//     //Get user sessions
//     static async getSessions(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const userUuid = req.user!.uuid;

//             const sessions = await SessionService.listSessions({
//                 userUuid,
//                 includeRevoked: false,
//             });

//             return res.status(200).json({
//                 success: true,
//                 sessions,
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to get sessions", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to retrieve sessions",
//             });
//         }
//     }

//     //DELETE /auth/sessions/:sessionUuid
//     static async revokeSession(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const { sessionUuid } = req.params;
//             const userUuid = req.user!.uuid;

//             // Verify session belongs to user
//             const session = await prisma.session.findFirst({
//                 where: {
//                     uuid: sessionUuid,
//                     userUuid,
//                 },
//             });

//             if (!session) {
//                 return res.status(404).json({
//                     error: "SESSION_NOT_FOUND",
//                     message: "Session not found",
//                 });
//             }

//             await SessionService.revokeSession({
//                 sessionUuid,
//                 revokedBy: userUuid,
//                 reason: "User revoked session",
//             });

//             logWithContext("info", "[Auth] Session revoked", {
//                 traceId,
//                 sessionUuid,
//             });

//             return res.status(200).json({
//                 success: true,
//                 message: "Session revoked successfully",
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to revoke session", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to revoke session",
//             });
//         }
//     }

//     //GET /auth/devices
//     static async getTrustedDevices(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const userUuid = req.user!.uuid;

//             const devices = await DeviceTrustService.listTrustedDevices(userUuid);

//             return res.status(200).json({
//                 success: true,
//                 devices,
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to get devices", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to retrieve devices",
//             });
//         }
//     }

//     //DELETE /auth/devices/:deviceUuid
//     static async revokeDeviceTrust(req: Request, res: Response) {
//         const traceId = req.headers["x-trace-id"] as string || `auth_${Date.now()}`;
        
//         try {
//             const { deviceUuid } = req.params;
//             const userUuid = req.user!.uuid;

//             await DeviceTrustService.revokeDeviceTrust({
//                 userUuid,
//                 deviceUuid,
//                 revokedBy: userUuid,
//             });

//             logWithContext("info", "[Auth] Device trust revoked", {
//                 traceId,
//                 deviceUuid,
//             });

//             return res.status(200).json({
//                 success: true,
//                 message: "Device trust revoked successfully",
//             });

//         } catch (error: any) {
//             logWithContext("error", "[Auth] Failed to revoke device trust", {
//                 traceId,
//                 error: error.message,
//             });

//             return res.status(500).json({
//                 error: "INTERNAL_SERVER_ERROR",
//                 message: "Failed to revoke device trust",
//             });
//         }
//     }
// }