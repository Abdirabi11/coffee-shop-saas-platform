import type { Request, Response } from "express";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { AuthService } from "../../services/auth/Auth.service.ts";
import { SessionService } from "../../services/auth/Session.service.ts";
import { TokenService } from "../../services/auth/Token.service.ts";
import { BiometricAuthService } from "../../services/auth/BiometricAuth.service.ts";
import { SocialAuthService } from "../../services/auth/SocialAuth.service.ts";
import { TwoFactorService } from "../../services/auth/TwoFactor.service.ts";
import { PasswordResetService } from "../../services/auth/PasswordReset.service.ts";
import { EmailVerificationService } from "../../services/auth/EmailVerification.service.ts";

 
// ── Error handler ────────────────────────────────────────────────────────────
 
function handleAuthError(error: any, res: Response, context: string) {
    const map: Record<string, { status: number }> = {
        // Auth
        PHONE_ALREADY_REGISTERED: { status: 409 },
        EMAIL_ALREADY_IN_USE:     { status: 409 },
        USER_NOT_FOUND:           { status: 404 },
        USER_OR_EMAIL_NOT_FOUND:  { status: 404 },
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
        INVALID_2FA_CODE:         { status: 400 },
        TOKEN_REUSE_DETECTED:     { status: 401 },
        TOKEN_EXPIRED:            { status: 401 },
        TOKEN_NOT_FOUND:          { status: 401 },
        NO_PASSWORD_SET:          { status: 400 },
        // Email verification
        EMAIL_ALREADY_VERIFIED:   { status: 400 },
        INVALID_OR_EXPIRED_TOKEN: { status: 400 },
        // Password reset
        RESET_TOKEN_EXPIRED:      { status: 400 },
        INVALID_RESET_TOKEN:      { status: 400 },
        PASSWORD_TOO_SHORT:       { status: 400 },
        // 2FA
        TWO_FA_ALREADY_ENABLED:   { status: 400 },
        TWO_FA_NOT_SETUP:         { status: 400 },
    };
    
    const mapped = map[error.message];
    if (mapped) {
        return res.status(mapped.status).json({ success: false, error: error.message });
    }
    
    logWithContext("error", `[AuthCtrl] ${context}`, { error: error.message });
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
    // ── AUTH FLOWS ──────────────────────────────────────────────────────────────
    
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
    
    // ── TOKEN MANAGEMENT ───────────────────────────────────────────────────────
    
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
            const session = await prisma.session.findFirst({ where: { uuid: req.params.sessionUuid || req.params.uuid, userUuid: user.uuid } });
            if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" });
            await SessionService.revokeSession({ sessionUuid: session.uuid, revokedBy: user.uuid, reason: "USER_REVOKE" });
            return res.status(200).json({ success: true, message: "Session revoked" });
        } catch { return res.status(500).json({ success: false, error: "REVOKE_FAILED" }); }
    }
    
    // ── EMAIL VERIFICATION (from EmailVerification.controller.ts) ──────────────

    // POST /auth/email/send-verification
    static async sendEmailVerification(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            await EmailVerificationService.sendVerificationEmail(user.uuid);
            return res.status(200).json({ success: true, message: "Verification email sent" });
        } catch (e: any) { return handleAuthError(e, res, "sendEmailVerification"); }
    }
    
    // GET /auth/email/verify
    static async verifyEmail(req: Request, res: Response) {
        try {
            const { token } = req.query;
            if (!token) return res.status(400).json({ success: false, error: "TOKEN_REQUIRED" });
            const result = await EmailVerificationService.verifyEmail(token as string);
            return res.status(200).json({ success: true, message: "Email verified", user: result.user });
        } catch (e: any) { return handleAuthError(e, res, "verifyEmail"); }
    }
    
    // POST /auth/email/resend
    static async resendEmailVerification(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            await EmailVerificationService.resendVerificationEmail(user.uuid);
            return res.status(200).json({ success: true, message: "Verification email resent" });
        } catch (e: any) { return handleAuthError(e, res, "resendEmailVerification"); }
    }
    
    // ── PASSWORD ───────────────────────────────────────────────────────────────
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
    
            await prisma.user.update({
                where: { uuid: user.uuid },
                data: {
                    passwordHash: await bcrypt.hash(newPassword, 12),
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                    passwordChangedAt: new Date(),
                    tokenVersion: { increment: 1 },
                },
            });
            await TokenService.revokeAllForUser(user.uuid, "PASSWORD_CHANGED");
        
            const tokens = await TokenService.issueTokenPair({ userUuid: user.uuid, tenantUuid: user.tenantUuid, role: user.role, req });
            setRefreshCookie(res, tokens.refreshToken);
            return res.status(200).json({ success: true, message: "Password changed", accessToken: tokens.accessToken });
        } catch (e: any) { return handleAuthError(e, res, "changePassword"); }
    }
    
    // POST /auth/password/forgot
    static async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, error: "EMAIL_REQUIRED" });
            await PasswordResetService.requestReset(email);
            // Always return success to prevent email enumeration
            return res.status(200).json({ success: true, message: "If the email exists, a reset link has been sent" });
        } catch (e: any) { return handleAuthError(e, res, "forgotPassword"); }
    }
    
    // POST /auth/password/reset
    static async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) return res.status(400).json({ success: false, error: "TOKEN_AND_PASSWORD_REQUIRED" });
            if (newPassword.length < 8) return res.status(400).json({ success: false, error: "PASSWORD_TOO_SHORT" });
            await PasswordResetService.resetPassword(token, newPassword);
            return res.status(200).json({ success: true, message: "Password reset. Please login." });
        } catch (e: any) { return handleAuthError(e, res, "resetPassword"); }
    }
    
    // ── 2FA SETUP ──────────────────────────────────────────────────────────────
    // POST /auth/2fa/setup
    static async setup2FA(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            const result = await TwoFactorService.generateSecret(user.uuid);
            return res.status(200).json({ success: true, data: result });
        } catch (e: any) { return handleAuthError(e, res, "setup2FA"); }
    }
    
    // POST /auth/2fa/enable
    static async enable2FA(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
            const { code } = req.body;
            if (!code) return res.status(400).json({ success: false, error: "CODE_REQUIRED" });
            const result = await TwoFactorService.enableWithVerification(user.uuid, code);
            return res.status(200).json({ success: true, message: "2FA enabled", backupCodes: result.backupCodes });
        } catch (e: any) { return handleAuthError(e, res, "enable2FA"); }
    }
    
    // ── PROFILE ────────────────────────────────────────────────────────────────
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
                    tenantUsers: {
                        where: { isActive: true },
                        include: {
                            tenant: { select: { uuid: true, name: true, slug: true } },
                        },
                    },
                },
            });
    
            if (!dbUser) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });
        
            return res.status(200).json({
                success: true,
                data: {
                    ...dbUser,
                    has2FA: dbUser.admin2FA?.enabled ?? false,
                    admin2FA: undefined,
                },
            });
        } catch { return res.status(500).json({ success: false, error: "FETCH_FAILED" }); }
    }
}
 